#!/bin/bash
# Cookie Service 管理脚本 (Linux)

function show_menu {
    clear
    echo "======================================="
    echo "   Cookie Service 管理脚本 (Linux)     "
    echo "======================================="
    echo "1. 启动服务 (前台运行)"
    echo "2. 启动服务 (后台运行)"
    echo "3. 停止服务"
    echo "4. 查看日志"
    echo "0. 退出"
    echo "======================================="
}

while true; do
    show_menu
    read -p "请选择操作 (0-4): " opt
    case $opt in
        1)
            echo "正在前台启动..."
            npm run start
            read -p "按回车键继续..."
            ;;
        2)
            echo "正在后台启动..."
            nohup npm run start > service.log 2>&1 &
            echo "已后台启动，输出重定向到 service.log (PID: $!)"
            read -p "按回车键继续..."
            ;;
        3)
            echo "正在停止服务 (端口 28472)..."
            # 使用 lsof 或 fuser 查找占用 28472 端口的进程并 kill
            if command -v lsof > /dev/null; then
                PIDS=$(lsof -t -i:28472)
                if [ -n "$PIDS" ]; then
                    kill -9 $PIDS
                    echo "服务已停止 (PID: $PIDS)。"
                else
                    echo "服务未运行。"
                fi
            else
                echo "未找到 lsof，尝试使用 fuser..."
                fuser -k 28472/tcp
                echo "操作完成。"
            fi
            read -p "按回车键继续..."
            ;;
        4)
            echo "==== 日志输出 ===="
            if [ -f service.log ]; then
                tail -n 20 service.log
            else
                echo "无日志文件。"
            fi
            echo "=================="
            read -p "按回车键继续..."
            ;;
        0)
            exit 0
            ;;
        *)
            echo "无效选项"
            sleep 1
            ;;
    esac
done
