# 增强型 RAG 引擎：智能 3GPP 协议查询系统

本项目是一个功能完备的检索增强生成（RAG）应用程序，旨在将复杂、密集的 3GPP TS 38.331（NR RRC 协议）技术文档转化为一个可交互、可通过自然语言查询的智能知识库。它由两部分组成：一个强大的**文档处理与向量化流水线**，以及一个集成了前后端的**高级 RAG 对话应用**。

## 项目愿景

3GPP 技术规范是无线通信的基石，但其专业性和复杂性为工程师带来了巨大的挑战。本项目利用尖端的大语言模型（LLM）和向量数据库技术，构建了一个端到端的解决方案，旨在彻底改变工程师与技术文档的交互方式，实现：

-   **高效信息检索**: 从耗时数小时的手动查阅，到数秒内获得精准答案。
-   **深度语义理解**: 超越关键词匹配，真正理解用户意图和协议内容的深层含义。
-   **知识探索与学习**: 降低协议学习曲线，使新手也能快速入门，专家也能发现新的关联。

## 系统架构

本系统采用经典的前后端分离架构，并结合了先进的 RAG 流程：

  <!-- 建议在此处添加一张架构图 -->

1.  **数据处理层 (Data Plane)**:
    -   `vectorize_novel.py`: 负责对源文档（3GPP TS 38.331 .txt 文件）进行预处理。它执行智能切块（Chunking），并为每个文本块提取丰富的元数据（如章节号、标题、内容类型），然后调用 `Silicon Flow` 的 `Qwen/Qwen3-Embedding-8B` 模型生成向量嵌入。
    -   最终输出一个结构化的 `JSON` 知识库文件。

2.  **后端服务层 (Backend Service)**:
    -   `server.py`: 一个基于 `Flask` 的轻量级 Python 服务器。
    -   **核心数据库**: 使用 `ChromaDB` 作为向量数据库，负责存储和高效检索文档向量。
    -   **API**: 提供 RESTful API 接口，用于加载知识库文件、执行复杂的混合搜索（向量搜索 + 元数据过滤）以及可选的重排（Reranking）。

3.  **前端应用层 (Frontend Application)**:
    -   `index.html`, `style.css`, `script.js`: 一个纯粹的 HTML/CSS/JavaScript 单页应用，为用户提供功能丰富的交互界面。
    -   **功能**: 用户可以在此界面中调整模型参数、管理知识库、进行对话，并能实时看到 RAG 流程的中间步骤。

## 核心功能详解

### 1. 向量化流水线

-   **智能文本分块**: 采用 `RecursiveCharacterTextSplitter`，并针对技术文档的特点优化了分隔符。
-   **精细化元数据提取**:
    -   `source_document`: 来源文档，支持多版本管理。
    -   `section_number` & `section_title`: 精确到子条款的章节信息。
    -   `content_type`: 自动推断内容类型（如 `prose` - 普通散文, `asn1_definition` - ASN.1 定义, `procedure` - 流程描述），为高级过滤查询提供支持。
    -   `chunk_id`: 全局唯一 ID，便于调试和溯源。
-   **高质量向量嵌入**: 利用 `Qwen/Qwen3-Embedding-8B` 模型，确保对技术术语的语义捕捉能力。

### 2. RAG 应用（`zhengqiangjiansuoshengcheng`）

-   **可配置的 RAG 流程**:
    -   **启用/禁用**: 用户可一键切换标准对话模式和 RAG 模式。
    -   **两阶段 LLM 调用**:
        -   **LLM1 (查询改写)**: 使用一个轻量级模型（如 Gemini Flash）将用户的原始、口语化的问题，改写为更适合向量检索的、包含技术关键词的查询。
        -   **LLM2 (综合回答)**: 在检索到相关上下文后，使用一个更强大的模型（如 Gemini Pro）结合原始问题、改写后查询和上下文，生成最终的、全面的、格式化的答案。
-   **高级检索策略**:
    -   **混合搜索 (Hybrid Search)**: 同时执行向量相似度搜索和基于元数据的精确过滤，结合两者的优势。
    -   **可调参数**: 用户可自定义向量搜索和元数据搜索返回的结果数量。
    -   **重排 (Reranking)**: 可选地集成第三方重排模型 API，对初步召回的结果进行二次排序，进一步提升最相关文档的排名。
-   **高度可定制的 UI**:
    -   **模型参数**: 可分别调整两个 LLM 的模型选择、温度（Temperature）、Top-P、最大输出长度等参数。
    -   **知识库管理**: 动态加载 `knowledge_base` 目录下的知识库文件，并支持一键加载到 ChromaDB。
    -   **流式输出**: 支持打字机效果的流式响应，提升用户体验。

## 项目文件结构

```
.
├── 向量化脚本/
│   ├── vectorize_novel.py     # 主向量化脚本
│   ├── test_embedding.ps1     # API 密钥和测试脚本
│   ├── README.md              # 本项目文档
│   ├── requirements.txt       # 向量化脚本的依赖
│   └── 文本/
│       └── 38331-i60.txt      # 原始 3GPP 文档
│
└── zhengqiangjiansuoshengcheng/
    ├── server.py              # 后端 Flask 服务器
    ├── index.html             # 前端页面
    ├── script.js              # 前端交互逻辑
    ├── style.css              # 前端样式
    ├── config.js              # 存储 API 密钥
    ├── requirements.txt       # 后端服务器的依赖
    ├── knowledge_base/        # 存放生成的知识库 JSON 文件
    └── chroma_db/             # ChromaDB 持久化存储目录
```

## 如何运行

### 步骤 1: 环境准备

-   **向量化脚本**:
    ```bash
    cd 向量化脚本
    pip install -r requirements.txt
    ```
-   **RAG 应用后端**:
    ```bash
    cd zhengqiangjiansuoshengcheng
    pip install -r requirements.txt
    ```

### 步骤 2: 配置 API 密钥

1.  **向量化密钥**: 打开 `向量化脚本/test_embedding.ps1`，将 `Authorization: Bearer` 后的值替换为您的 **Silicon Flow API 密钥**。
2.  **RAG 应用密钥**: 打开 `zhengqiangjiansuoshengcheng/config.js`，填入您的 **Gemini API 密钥** 和 **重排模型 API 密钥**（如果使用）。

### 步骤 3: 生成知识库

1.  确保您的 3GPP `.txt` 文件位于 `向量化脚本/文本/` 目录下。
2.  运行向量化脚本。这将会生成 `3gpp_ts_38331_embedded.json` 文件并自动放置到 `zhengqiangjiansuoshengcheng/knowledge_base/` 中。
    ```bash
    # 在项目根目录运行
    python 向量化脚本/vectorize_novel.py
    ```
    **注意**: 此过程会调用 API 进行大量计算，可能需要较长时间。

### 步骤 4: 一键启动应用

为了简化启动流程，项目根目录下提供了一个 `start_app.ps1` 脚本，可以同时启动后端和前端服务。

在 PowerShell 终端中运行：
```powershell
./start_app.ps1
```

该脚本会自动：
1.  启动后端的 Flask API 服务（在 `http://127.0.0.1:5001`）。
2.  为前端文件启动一个本地 HTTP 服务器（在 `http://localhost:8000`）。
3.  在您的默认浏览器中打开应用。

### 步骤 5: 使用应用

1.  前端页面加载后，它会自动列出 `knowledge_base` 文件夹中的 `3gpp_ts_38331_embedded.json` 文件。
2.  勾选该文件，然后点击 **"加载选中文件到数据库"** 按钮。
3.  等待加载完成的提示。
4.  在右侧的设置面板中，**启用增强检索 (RAG)**。
5.  现在，您可以在聊天框中开始提问了！

## 未来展望

-   **多文档支持**: 扩展系统以同时管理和查询多个不同版本或不同类型的技术规范。
-   **引用溯源**: 在 LLM 的回答中，明确标注信息来源于原文的哪个章节，并提供链接或原文片段。
-   **可视化分析**: 对文档结构或查询结果进行可视化展示，帮助用户更好地理解文档内容。
-   **用户反馈循环**: 引入用户对回答质量的点赞/点踩机制，用于未来对检索和生成模型的微调。