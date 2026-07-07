#!/bin/sh
# ai-todo daily-digest cron(VPS root crontab 调用)
# 容器内执行,读容器 env CRON_SECRET(脚本里 $CRON_SECRET 字面,容器内 sh -c 展开)
# 时区 Asia/Shanghai,crontab 0 9(北京 09:00)= 原 vercel UTC 01:00
docker exec ai-todo sh -c 'wget -q -O/dev/null --header="Authorization: Bearer $CRON_SECRET" http://localhost:3002/api/cron/daily-digest'
