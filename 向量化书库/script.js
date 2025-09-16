document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素获取 ---
    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    
    // --- 配置管理 UI ---
    const configNameInput = document.getElementById('config-name');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const deleteConfigBtn = document.getElementById('delete-config-btn');
    const configSelect = document.getElementById('config-select');

    // --- 所有需要保存的设置项的 ID ---
    const allSettingIds = [
        'system-prompt', 'model-select', 'temperature', 'top-p', 'max-output-tokens', 'stream-output',
        'rag-enabled', 'metadata-keyword', 'vector-results', 'metadata-results',
        'metadata-schema', 'rerank-api-url', 'recall-mode',
        'llm1-prompt', 'llm1-model-select', 'llm1-temperature', 'llm1-top-p', 'llm1-max-output-tokens',
        'llm2-prompt', 'llm2-model-select', 'llm2-temperature', 'llm2-top-p', 'llm2-max-output-tokens', 'llm2-stream-output'
    ];
    
    // --- 主模型设置 (非RAG模式) ---
    const mainModelConfigGroup = document.querySelector('.llm-config-group'); // 获取主模型设置的容器
    const mainModelSelect = document.getElementById('model-select');
    const mainTemperature = document.getElementById('temperature');
    const mainTemperatureValue = document.getElementById('temperature-value');
    const mainTopP = document.getElementById('top-p');
    const mainTopPValue = document.getElementById('top-p-value');
    const mainMaxOutputTokens = document.getElementById('max-output-tokens');
    const mainMaxOutputTokensValue = document.getElementById('max-output-tokens-value');
    const mainStreamOutput = document.getElementById('stream-output');
    const systemPrompt = document.getElementById('system-prompt');

    // --- RAG UI 元素获取 ---
    const ragEnabled = document.getElementById('rag-enabled');
    const kbFilesContainer = document.getElementById('knowledge-base-files');
    const loadKbBtn = document.getElementById('load-kb-btn');
    const metadataKeyword = document.getElementById('metadata-keyword');
    const vectorResults = document.getElementById('vector-results');
    const metadataResults = document.getElementById('metadata-results');
    const metadataSchema = document.getElementById('metadata-schema');
    const rerankApiUrl = document.getElementById('rerank-api-url');
    const recallMode = document.getElementById('recall-mode');

    // LLM1 设置
    const llm1Prompt = document.getElementById('llm1-prompt');
    const llm1ModelSelect = document.getElementById('llm1-model-select');
    const llm1Temperature = document.getElementById('llm1-temperature');
    const llm1TemperatureValue = document.getElementById('llm1-temperature-value');
    const llm1TopP = document.getElementById('llm1-top-p');
    const llm1TopPValue = document.getElementById('llm1-top-p-value');
    const llm1MaxOutputTokens = document.getElementById('llm1-max-output-tokens');
    const llm1MaxOutputTokensValue = document.getElementById('llm1-max-output-tokens-value');

    // LLM2 设置
    const llm2Prompt = document.getElementById('llm2-prompt');
    const llm2ModelSelect = document.getElementById('llm2-model-select');
    const llm2Temperature = document.getElementById('llm2-temperature');
    const llm2TemperatureValue = document.getElementById('llm2-temperature-value');
    const llm2TopP = document.getElementById('llm2-top-p');
    const llm2TopPValue = document.getElementById('llm2-top-p-value');
    const llm2MaxOutputTokens = document.getElementById('llm2-max-output-tokens');
    const llm2MaxOutputTokensValue = document.getElementById('llm2-max-output-tokens-value');
    const llm2StreamOutput = document.getElementById('llm2-stream-output');

    // --- 初始化历史记录 ---
    let conversationHistory = [];

    // --- 事件监听器 ---
    function setupEventListeners() {
        sendBtn.addEventListener('click', sendMessage);
        loadKbBtn.addEventListener('click', loadSelectedFiles);
        saveConfigBtn.addEventListener('click', saveConfiguration);
        deleteConfigBtn.addEventListener('click', deleteConfiguration);
        configSelect.addEventListener('change', loadConfiguration);

        // RAG 启用/禁用时，切换主模型UI的可见性
        ragEnabled.addEventListener('change', () => {
            mainModelConfigGroup.style.display = ragEnabled.checked ? 'none' : 'block';
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // 更新滑块显示的值
        const sliders = {
            'temperature': mainTemperatureValue, 'top-p': mainTopPValue, 'max-output-tokens': mainMaxOutputTokensValue,
            'llm1-temperature': llm1TemperatureValue, 'llm1-top-p': llm1TopPValue, 'llm1-max-output-tokens': llm1MaxOutputTokensValue,
            'llm2-temperature': llm2TemperatureValue, 'llm2-top-p': llm2TopPValue, 'llm2-max-output-tokens': llm2MaxOutputTokensValue
        };
        for (const key in sliders) {
            document.getElementById(key).addEventListener('input', (e) => sliders[key].textContent = e.target.value);
        }
    }

    // --- 核心功能：发送消息 ---
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        appendMessage(message, 'user');
        chatInput.value = '';
        const botMessageElement = appendMessage('...', 'bot');

        if (ragEnabled.checked) {
            runTwoStageRag(message, botMessageElement);
        } else {
            let currentConversation = [];
            if (systemPrompt.value.trim()) {
                currentConversation.push({ role: 'user', parts: [{ text: systemPrompt.value.trim() }] });
                currentConversation.push({ role: 'model', parts: [{ text: "好的。" }] });
            }
            currentConversation.push(...conversationHistory);
            currentConversation.push({ role: 'user', parts: [{ text: message }] });

            const generationConfig = {
                temperature: parseFloat(mainTemperature.value),
                topP: parseFloat(mainTopP.value),
                maxOutputTokens: parseInt(mainMaxOutputTokens.value, 10),
                candidateCount: 1,
            };
            callGeminiApi(currentConversation, mainModelSelect.value, generationConfig, botMessageElement, message, mainStreamOutput.checked);
        }
    }

    // --- RAG 两阶段流程 ---
    async function runTwoStageRag(originalMessage, botMessageElement) {
        try {
            // --- 阶段 1: LLM1 查询改写 ---
            botMessageElement.textContent = '第一步：正在改写查询...';
            const llm1Config = {
                temperature: parseFloat(llm1Temperature.value),
                topP: parseFloat(llm1TopP.value),
                maxOutputTokens: parseInt(llm1MaxOutputTokens.value, 10),
                candidateCount: 1,
            };
            let llm1Conversation = [];
            if (llm1Prompt.value.trim()) {
                 llm1Conversation.push({ role: 'user', parts: [{ text: llm1Prompt.value.trim().replace('{{user_query}}', originalMessage) }] });
            } else {
                 llm1Conversation.push({ role: 'user', parts: [{ text: originalMessage }] });
            }
            
            const rewrittenQueryJson = await callGeminiApi(llm1Conversation, llm1ModelSelect.value, llm1Config, null, null, false);
            if (!rewrittenQueryJson) throw new Error("LLM1未能返回改写后的查询。");
            const rewrittenQueryData = JSON.parse(rewrittenQueryJson.replace(/```json\n?/, '').replace(/```$/, ''));


            // --- 阶段 2: 检索 ---
            botMessageElement.textContent = '第二步：正在使用改写后的查询进行检索...';
            const searchPayload = {
                query: rewrittenQueryData.vector_query_expansion,
                recall_mode: recallMode.value,
                n_vector_results: parseInt(vectorResults.value, 10),
                metadata_keyword: metadataKeyword.value.trim(),
                n_metadata_results: parseInt(metadataResults.value, 10),
                rerank_url: rerankApiUrl.value.trim(),
                rerank_api_key: window.APP_CONFIG?.RERANK_API_KEY || ''
            };
            const searchResponse = await fetch('http://127.0.0.1:5001/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(searchPayload) });
            const searchResult = await searchResponse.json();
            if (!searchResponse.ok) throw new Error(searchResult.error || '检索失败');

            // --- 阶段 3: LLM2 最终回答 ---
            botMessageElement.textContent = '第三步：正在根据上下文生成最终回答...';
            const llm2Config = {
                temperature: parseFloat(llm2Temperature.value),
                topP: parseFloat(llm2TopP.value),
                maxOutputTokens: parseInt(llm2MaxOutputTokens.value, 10),
                candidateCount: 1,
            };
            const context = searchResult.length > 0 ? searchResult.map(doc => `[Source: ${doc.metadata.section_number}] ${doc.document}`).join('\n\n---\n\n') : "未在知识库中找到相关信息。";
            const finalPrompt = llm2Prompt.value.trim()
                .replace('{{retrieved_contexts}}', context)
                .replace('{{user_query}}', originalMessage);

            let llm2Conversation = [{ role: 'user', parts: [{ text: finalPrompt }] }];
            
            await callGeminiApi(llm2Conversation, llm2ModelSelect.value, llm2Config, botMessageElement, originalMessage, llm2StreamOutput.checked);

        } catch (error) {
            console.error('RAG 流程失败:', error);
            botMessageElement.textContent = `错误: ${error.message}`;
            botMessageElement.style.color = 'red';
        }
    }

    // --- 统一的 Gemini API 调用函数 ---
    async function callGeminiApi(conversation, model, generationConfig, botMessageElement, originalMessage, stream = true) {
        const geminiApiKey = window.APP_CONFIG?.GEMINI_API_KEY;

        if (!geminiApiKey || geminiApiKey === 'YOUR_GEMINI_API_KEY_HERE') {
            const errorMsg = "错误: Gemini API 密钥未在 config.js 中配置。";
             if(botMessageElement) {
                botMessageElement.textContent = errorMsg;
                botMessageElement.style.color = 'red';
            }
            throw new Error(errorMsg);
        }

        try {
            const requestBody = { contents: conversation, generationConfig: generationConfig };
            const isStreaming = stream;
            let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:`;
            endpoint += isStreaming ? `streamGenerateContent?alt=sse&key=${geminiApiKey}` : `generateContent?key=${geminiApiKey}`;

            const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.error?.message || JSON.stringify(errorData) || 'API 请求失败');
            }

            if (isStreaming) {
                await handleStreamResponse(response, botMessageElement, originalMessage);
            } else {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (botMessageElement) handleStandardResponse(data, botMessageElement, originalMessage);
                return text;
            }
        } catch (error) {
            console.error('调用 Gemini API 时出错:', error);
            if (botMessageElement) {
                botMessageElement.textContent = `错误: ${error.message}`;
                botMessageElement.style.color = 'red';
            }
            throw error;
        }
    }

    // --- 辅助功能：处理响应和UI ---
    async function handleStreamResponse(response, botMessageElement, message) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullResponseText = '';
        if (botMessageElement) botMessageElement.textContent = '';

        const dataPrefix = "data: ";
        while (true) {
            try {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith(dataPrefix)) {
                        const jsonStr = line.substring(dataPrefix.length);
                        if (jsonStr.trim()) {
                            try {
                                const parsed = JSON.parse(jsonStr);
                                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                if (text) {
                                    fullResponseText += text;
                                    if (botMessageElement) {
                                        botMessageElement.textContent = fullResponseText;
                                        chatHistory.scrollTop = chatHistory.scrollHeight;
                                    }
                                }
                            } catch (e) { /* 忽略解析错误 */ }
                        }
                    }
                }
            } catch (error) { console.error('读取流时出错:', error); break; }
        }
        if (botMessageElement && message) {
            conversationHistory.push({ role: 'user', parts: [{ text: message }] });
            conversationHistory.push({ role: 'model', parts: [{ text: fullResponseText }] });
        }
    }

    function handleStandardResponse(data, botMessageElement, message) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '未能获取回复。';
        botMessageElement.textContent = text;
        if (message) {
            conversationHistory.push({ role: 'user', parts: [{ text: message }] });
            conversationHistory.push({ role: 'model', parts: [{ text: text }] });
        }
    }

    function appendMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        messageElement.textContent = text;
        chatHistory.appendChild(messageElement);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return messageElement;
    }

    // --- RAG 相关功能 ---
    async function populateKbFiles() {
        try {
            const response = await fetch('http://127.0.0.1:5001/list_files');
            if (!response.ok) throw new Error('无法获取知识库文件列表');
            const files = await response.json();
            kbFilesContainer.innerHTML = '';
            files.forEach(file => {
                const div = document.createElement('div');
                div.innerHTML = `<input type="checkbox" id="kb-${file}" name="kb-file" value="${file}"><label for="kb-${file}">${file}</label>`;
                kbFilesContainer.appendChild(div);
            });
        } catch (error) {
            console.error('填充知识库文件失败:', error);
            kbFilesContainer.textContent = '加载文件列表失败。';
        }
    }

    async function loadSelectedFiles() {
        const selectedFiles = Array.from(document.querySelectorAll('input[name="kb-file"]:checked')).map(cb => cb.value);
        if (selectedFiles.length === 0) {
            alert('请至少选择一个文件。');
            return;
        }
        try {
            const response = await fetch('http://127.0.0.1:5001/load_documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: selectedFiles }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '加载文件失败');
            alert(result.message);
        } catch (error) {
            console.error('加载知识库文件时出错:', error);
            alert(`错误: ${error.message}`);
        }
    }

    // --- 配置管理功能 ---
    function saveConfiguration() {
        const name = configNameInput.value.trim();
        if (!name) {
            alert('请输入配置名称。');
            return;
        }

        try {
            let configs = JSON.parse(localStorage.getItem('rag_configs') || '{}');
            configs[name] = {};
            allSettingIds.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    configs[name][id] = (element.type === 'checkbox') ? element.checked : element.value;
                }
            });

            localStorage.setItem('rag_configs', JSON.stringify(configs));
            alert(`配置 "${name}" 已保存。`);
            populateConfigDropdown();
            configSelect.value = name;
        } catch (error) {
            console.error("保存配置时出错:", error);
            alert("保存配置时出错，请查看控制台了解详情。");
        }
    }

    function loadConfiguration() {
        const name = configSelect.value;
        if (!name) return;

        try {
            let configs = JSON.parse(localStorage.getItem('rag_configs') || '{}');
            const selectedConfig = configs[name];
            if (!selectedConfig) return;

            allSettingIds.forEach(id => {
                const element = document.getElementById(id);
                const value = selectedConfig[id];
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = value;
                    } else {
                        element.value = value;
                    }
                    // 触发 input 事件以更新滑块的显示值
                    element.dispatchEvent(new Event('input'));
                }
            });
            configNameInput.value = name;
            alert(`配置 "${name}" 已加载。`);
        } catch (error) {
            console.error("加载配置时出错:", error);
            alert("加载配置时出错，请查看控制台了解详情。");
        }
    }

    function deleteConfiguration() {
        const name = configSelect.value;
        if (!name) {
            alert('请先选择一个要删除的配置。');
            return;
        }
        if (!confirm(`确定要删除配置 "${name}" 吗？`)) return;

        let configs = JSON.parse(localStorage.getItem('rag_configs') || '{}');
        delete configs[name];
        localStorage.setItem('rag_configs', JSON.stringify(configs));
        alert(`配置 "${name}" 已删除。`);
        configNameInput.value = '';
        populateConfigDropdown();
    }

    function populateConfigDropdown() {
        let configs = JSON.parse(localStorage.getItem('rag_configs') || '{}');
        const names = Object.keys(configs);
        
        configSelect.innerHTML = '<option value="">选择一个配置...</option>'; // 重置
        names.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            configSelect.appendChild(option);
        });
    }

    // 更新滑块显示值的通用函数
    function updateSliderValue(sliderId, displayId) {
        const slider = document.getElementById(sliderId);
        const display = document.getElementById(displayId);
        if (slider && display) {
            display.textContent = slider.value;
            slider.addEventListener('input', () => display.textContent = slider.value);
        }
    }

    // --- 启动 ---
    setupEventListeners();
    populateKbFiles();
    populateConfigDropdown(); // 初始加载配置列表
    
    // 初始化所有滑块的值显示
    updateSliderValue('temperature', 'temperature-value');
    updateSliderValue('top-p', 'top-p-value');
    updateSliderValue('max-output-tokens', 'max-output-tokens-value');
    updateSliderValue('llm1-temperature', 'llm1-temperature-value');
    updateSliderValue('llm1-top-p', 'llm1-top-p-value');
    updateSliderValue('llm1-max-output-tokens', 'llm1-max-output-tokens-value');
    updateSliderValue('llm2-temperature', 'llm2-temperature-value');
    updateSliderValue('llm2-top-p', 'llm2-top-p-value');
    updateSliderValue('llm2-max-output-tokens', 'llm2-max-output-tokens-value');
});
