from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import chromadb
import os
import json
import requests

# 初始化 Flask 应用，并指定静态文件目录
app = Flask(__name__, static_folder='.', static_url_path='')
# 启用 CORS，允许所有来源的请求，这在开发阶段很方便
CORS(app)

# --- ChromaDB 设置 ---
# 确保数据库存储目录存在
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")
if not os.path.exists(db_path):
    os.makedirs(db_path)

# 初始化持久化的 ChromaDB 客户端
client = chromadb.PersistentClient(path=db_path)

# 获取或创建集合
# 在实际应用中，集合名称可以是动态的
collection_name = "my_collection"
collection = client.get_or_create_collection(name=collection_name)

# --- API 路由 ---

@app.route('/')
def serve_index():
    """
    提供 index.html 文件。
    """
    return send_from_directory('.', 'index.html')

@app.route('/api/')
def index():
    """
    API 根路由，用于检查服务器是否正在运行。
    """
    return jsonify({"message": "ChromaDB-backed server is running!"})

@app.route('/list_files', methods=['GET'])
def list_files():
    """
    列出 knowledge_base 文件夹中所有的 .json 文件。
    """
    try:
        kb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge_base")
        if not os.path.exists(kb_path):
            return jsonify({"error": "Knowledge base directory not found."}), 404
        
        json_files = [f for f in os.listdir(kb_path) if f.endswith('.json')]
        return jsonify(json_files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/load_documents', methods=['POST'])
def load_documents():
    """
    加载指定的 JSON 文件到 ChromaDB 集合中。
    请求体应为: {"filenames": ["file1.json", "file2.json"]}
    """
    try:
        data = request.get_json()
        filenames = data.get('filenames')
        if not filenames:
            return jsonify({"error": "No filenames provided."}), 400

        kb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge_base")
        
        all_embeddings = []
        all_documents = []
        all_metadatas = []
        all_ids = []

        for filename in filenames:
            file_path = os.path.join(kb_path, filename)
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    docs = json.load(f)
                    for doc in docs:
                        # 兼容新的和旧的知识库格式
                        embedding = doc.get('embedding') or doc.get('vector')
                        document_text = doc.get('document') or doc.get('text')
                        doc_id = doc.get('id') or doc.get('metadata', {}).get('chunk_id')

                        if not all([embedding, document_text, doc_id]):
                            continue # 跳过格式不正确的条目

                        all_embeddings.append(embedding)
                        all_documents.append(document_text)
                        all_metadatas.append(doc.get('metadata', {}))
                        all_ids.append(doc_id)
            else:
                 return jsonify({"error": f"File not found: {filename}"}), 404

        if not all_ids:
            return jsonify({"message": "No documents found in the specified files to load."})

        # 分批次 upsert 以避免超出数据库限制
        batch_size = 1000
        for i in range(0, len(all_ids), batch_size):
            batch_ids = all_ids[i:i + batch_size]
            batch_embeddings = all_embeddings[i:i + batch_size]
            batch_documents = all_documents[i:i + batch_size]
            batch_metadatas = all_metadatas[i:i + batch_size]
            
            collection.upsert(
                ids=batch_ids,
                embeddings=batch_embeddings,
                documents=batch_documents,
                metadatas=batch_metadatas
            )
            app.logger.info(f"Upserted batch {i//batch_size + 1} with {len(batch_ids)} documents.")
        
        return jsonify({"message": f"Successfully loaded documents from {', '.join(filenames)}."})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/search', methods=['POST'])
def search():
    """
    执行混合搜索（向量+元数据），并可选择进行重排。
    """
    try:
        data = request.get_json()
        query_text = data.get('query')
        if not query_text:
            return jsonify({"error": "Query text is required."}), 400

        # 获取检索参数
        n_vector_results = int(data.get('n_vector_results', 2))
        metadata_keyword = data.get('metadata_keyword', '')
        n_metadata_results = int(data.get('n_metadata_results', 2))
        
        # 获取重排参数
        rerank_url = data.get('rerank_url')
        rerank_api_key = data.get('rerank_api_key')
        
        recall_mode = data.get('recall_mode', 'hybrid')

        # --- 1. 可配置的召回策略 ---
        vector_search_results = {'ids': [[]], 'documents': [[]], 'metadatas': [[]]}
        metadata_search_results = {'ids': [[]], 'documents': [[]], 'metadatas': [[]]}

        # 1a. 向量搜索
        if recall_mode in ['hybrid', 'vector']:
            vector_search_results = collection.query(
                query_texts=[query_text],
                n_results=n_vector_results
            )
        
        # 1b. 元数据过滤
        if recall_mode in ['hybrid', 'metadata'] and metadata_keyword and '=' in metadata_keyword:
            key, value = metadata_keyword.split('=', 1)
            metadata_search_results = collection.get(
                where={key.strip(): value.strip()},
                n_results=n_metadata_results
            )

        # --- 2. 结果融合 ---
        combined_results = {}
        # 将向量搜索结果添加到融合列表
        for i, doc_id in enumerate(vector_search_results.get('ids', [[]])[0]):
            if doc_id not in combined_results:
                combined_results[doc_id] = {
                    "document": vector_search_results['documents'][0][i],
                    "metadata": vector_search_results['metadatas'][0][i]
                }
        
        # 将元数据搜索结果添加到融合列表
        for i, doc_id in enumerate(metadata_search_results.get('ids', [[]])[0]):
            if doc_id not in combined_results:
                 combined_results[doc_id] = {
                    "document": metadata_search_results['documents'][0][i],
                    "metadata": metadata_search_results['metadatas'][0][i]
                }

        # 如果没有召回任何结果，直接返回
        if not combined_results:
            return jsonify([])

        # --- 3. 调用重排 API (如果提供了URL) ---
        if rerank_url and rerank_api_key:
            headers = {
                "Authorization": f"Bearer {rerank_api_key}",
                "Content-Type": "application/json"
            }
            rerank_payload = {
                "model": "Qwen/Qwen3-Reranker-8B", # 根据用户要求更新
                "query": query_text,
                "documents": [res['document'] for res in combined_results.values()]
            }
            
            rerank_response = requests.post(rerank_url, headers=headers, json=rerank_payload)
            rerank_response.raise_for_status() # 如果请求失败则抛出异常
            
            rerank_data = rerank_response.json()
            
            # 根据重排结果重新排序文档
            sorted_documents = []
            for result in rerank_data.get('results', []):
                # 找到原始文档并添加到排序后的列表中
                original_doc = rerank_payload['documents'][result['index']]
                for res in combined_results.values():
                    if res['document'] == original_doc:
                        sorted_documents.append(res)
                        break
            return jsonify(sorted_documents)

        # 如果不进行重排，直接返回融合后的结果
        return jsonify(list(combined_results.values()))

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- 启动服务器 ---
if __name__ == '__main__':
    # 在 0.0.0.0 上运行，使其可以从本地网络访问
    # 使用 5001 端口，避免与常见的前端开发服务器端口冲突
    app.run(host='0.0.0.0', port=5001, debug=True)
