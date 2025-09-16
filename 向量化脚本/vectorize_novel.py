# 导入所需的库
import json
import time
from langchain_community.vectorstores import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader
from langchain_openai import OpenAIEmbeddings
from langchain.schema import Document
import re
import os

# --- 1. 定义一些基本配置 ---

# 3GPP 文件路径
NOVEL_FILE_PATH = "向量化脚本/文本/38331-i60.txt"
# 处理后要存入的JSON文件路径
OUTPUT_JSON_PATH = "zhengqiangjiansuoshengcheng/knowledge_base/3gpp_ts_38331_embedded.json" 
# 文档源标识
SOURCE_DOCUMENT = "3GPP TS 38.331 v16.6.0"
# 使用 Silicon Flow 的模型
EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-8B" 
# Silicon Flow API 的 Base URL
API_BASE_URL = "https://api.siliconflow.cn/v1"

# 从 test_embedding.ps1 文件中获取 API Key
def get_api_key_from_ps1(file_path="向量化脚本/test_embedding.ps1"):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        match = re.search(r"Authorization: Bearer\s+([^\s`']+)", content)
        if match:
            return match.group(1)
    except FileNotFoundError:
        print(f"警告: 未找到 {file_path} 文件。")
    return None

API_KEY = get_api_key_from_ps1()
if not API_KEY:
    # 如果从文件中获取失败，再尝试从环境变量中获取
    API_KEY = os.environ.get("SILICONFLOW_API_KEY")
    if not API_KEY:
        raise ValueError("未能从 test_embedding.ps1 或环境变量中获取 SILICONFLOW_API_KEY")

# --- 2. 定义如何从文本中提取元数据 ---

def get_content_type(text_chunk):
    """根据文本块内容判断内容类型"""
    if "::=" in text_chunk and "SEQUENCE" in text_chunk:
        return "asn1_definition"
    if re.search(r'^\s*-\s*if\s', text_chunk, re.IGNORECASE | re.MULTILINE) or re.search(r'^\s*\d+\.\s', text_chunk, re.MULTILINE):
        return "procedure"
    # 可以根据需要添加更多规则，例如表格、定义等
    # 此处简化处理
    if len(text_chunk.split()) < 20: # 假设短句是定义或缩写
        return "definition"
    return "prose"

def get_section_info_for_chunk(chunk, text_content, section_map):
    """为给定的文本块找到其所属的章节号和标题"""
    try:
        # 尝试精确定位
        chunk_start_index = text_content.find(chunk)
    except ValueError:
        # 如果精确定位失败，尝试模糊定位
        try:
            # 忽略开头和结尾的一些字符，以防切分不完整
            chunk_start_index = text_content.find(chunk[10:-10])
        except ValueError:
            return "Unknown", "Unknown"

    # 从后往前遍历章节映射，找到第一个在文本块之前开始的章节
    for start_char, (section_number, section_title) in reversed(list(section_map.items())):
        if chunk_start_index >= start_char:
            return section_number, section_title
            
    return "Unknown", "Unknown"

# --- 3. 主处理流程 ---

if __name__ == '__main__':
    print(f"开始加载3GPP文档: {NOVEL_FILE_PATH}...")
    loader = TextLoader(NOVEL_FILE_PATH, encoding='utf-8')
    documents = loader.load()
    text_content = documents[0].page_content

    print("正在建立章节索引...")
    # 正则表达式匹配章节号和标题，例如 "5.3.5 RRC connection establishment" 或 "Annex A (informative):"
    section_pattern = r'^((\d+(\.\d+)*)|(Annex\s+[A-Z]))\s+([^\n]+)'
    section_matches = list(re.finditer(section_pattern, text_content, re.MULTILINE))
    section_map = {m.start(): (m.group(1), m.group(5).strip()) for m in section_matches}
    print(f"找到 {len(section_map)} 个章节/部分。")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,  # 增加 chunk_size 以包含更多上下文
        chunk_overlap=150,
        separators=["\n\n\n", "\n\n", "\n", ". ", ", ", " "] # 针对技术文档优化
    )

    print("正在切分文档并添加元数据...")
    docs_with_metadata = []
    chunks = text_splitter.split_text(text_content)
    
    for i, chunk in enumerate(chunks):
        section_number, section_title = get_section_info_for_chunk(chunk, text_content, section_map)
        content_type = get_content_type(chunk)
        
        # 创建唯一的 chunk_id
        section_id_part = str(section_number).replace('.', '-') if section_number != "Unknown" else "unknown_sec"
        chunk_id = f"{SOURCE_DOCUMENT.replace(' ', '_').replace('.', '')}_sec_{section_id_part}_chunk_{i}"

        doc = Document(
            page_content=chunk,
            metadata={
                "source_document": SOURCE_DOCUMENT,
                "section_number": section_number,
                "section_title": section_title,
                "content_type": content_type,
                "chunk_id": chunk_id
            }
        )
        docs_with_metadata.append(doc)
        if (i+1) % 1000 == 0:
            print(f"已处理 {i+1} 个数据块...")

    print(f"文档切分完成，共 {len(docs_with_metadata)} 个数据块。")
    print("正在初始化API Embedding函数...")
    embedding_function = OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        openai_api_base=API_BASE_URL,
        openai_api_key=API_KEY,
        dimensions=1024 # dimensions 参数需要直接传递
    )

    print("正在生成向量并构建JSON文件...")
    output_data = []
    total_chunks = len(docs_with_metadata)
    for i, doc in enumerate(docs_with_metadata):
        # 为避免API速率限制，可以加入微小的延迟
        time.sleep(0.01)
        
        vector = embedding_function.embed_query(doc.page_content)
        
        output_data.append({
            "id": doc.metadata['chunk_id'], # 使用 chunk_id 作为唯一标识符
            "embedding": vector,
            "document": doc.page_content,
            "metadata": doc.metadata
        })
        
        if (i+1) % 100 == 0:
            print(f"已向量化 {i+1}/{total_chunks} 个数据块...")

    print("所有数据块已处理，正在写入JSON文件...")
    with open(OUTPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=4)

    print(f"太棒了！你的专属3GPP知识库已成功创建在 '{OUTPUT_JSON_PATH}' 文件中。")
