# ===================================================================
# == 增强型 RAG 引擎 - 一键启动脚本 (PowerShell)
# ==
# == 此脚本会同时启动后端 Flask API 服务和前端 HTTP 服务器，
# == 并在默认浏览器中打开应用。
# ===================================================================

# --- 配置 ---
$backend_script = "zhengqiangjiansuoshengcheng/server.py"
$frontend_dir = "zhengqiangjiansuoshengcheng"
$frontend_port = 8000
$backend_port = 5001

# --- 启动后端服务 ---
Write-Host "正在启动后端 Flask 服务器 (端口 $backend_port)..." -ForegroundColor Green
Start-Process python -ArgumentList $backend_script -NoNewWindow

# --- 启动前端服务 ---
Write-Host "正在为前端启动 HTTP 服务器 (端口 $frontend_port)..." -ForegroundColor Green
# 在 zhengqiangjiansuoshengcheng 目录下运行 http.server
Start-Process python -ArgumentList "-m", "http.server", "$frontend_port" -WorkingDirectory (Resolve-Path $frontend_dir)

# --- 等待服务器初始化 ---
Write-Host "等待服务器启动 (5秒)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# --- 在浏览器中打开前端页面 ---
$frontendUrl = "http://localhost:$frontend_port"
Write-Host "后端服务运行在 http://127.0.0.1:$backend_port" -ForegroundColor Cyan
Write-Host "前端应用已就绪！正在浏览器中打开: $frontendUrl" -ForegroundColor Cyan
Start-Process $frontendUrl

Write-Host "
---
启动完成！
- 后端 API 服务正在运行。
- 前端应用应该已在您的浏览器中打开。
- 您现在可以按照 README 文档的指引，加载知识库并开始使用了。
---
" -ForegroundColor Magenta
