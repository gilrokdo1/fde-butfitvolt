# FDE 백엔드 EC2 셋업 가이드

> ⚠️ **운영자 전용 문서**. 최초 1회 EC2 셋업할 때만 필요. 팀원은 SSH/PEM 불필요 — PR만 올리면 GitHub Actions가 자동 배포한다.

## 1. PostgreSQL FDE DB 생성

```bash
ssh -i BUTFITSEOUL_FDE1.pem ec2-user@13.209.66.148

# PostgreSQL에 FDE DB + 유저 생성
sudo -u postgres psql -c "CREATE USER fde WITH PASSWORD '비밀번호';"
sudo -u postgres psql -c "CREATE DATABASE fde OWNER fde;"

# 스키마 적용
psql -U fde -d fde -f ~/fde1/fde-backend/schema.sql
```

## 2. FDE 백엔드 최초 배포

```bash
# 로컬에서
./deploy.sh fde-backend

# EC2에서 .env 생성
ssh -i BUTFITSEOUL_FDE1.pem ec2-user@13.209.66.148
cd ~/fde1/fde-backend
cp .env.example .env

# JWT 시크릿 생성
python3 -c "import secrets; print(secrets.token_hex(32))"
# 위 값을 .env의 FDE_JWT_SECRET에 넣기

# 나머지 .env 값도 채우기
nano .env
```

## 3. systemd 서비스 등록

```bash
sudo tee /etc/systemd/system/fde-backend.service << 'EOF'
[Unit]
Description=FDE Backend API
After=network.target

[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/fde1/fde-backend
ExecStart=/usr/local/bin/uvicorn main:app --host 0.0.0.0 --port 8002
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable fde-backend
sudo systemctl start fde-backend

# 확인
curl http://localhost:8002/fde-api/health
```

## 4. Nginx 설정

기존 Nginx 설정에 추가:

```nginx
location /fde-api/ {
    proxy_pass http://127.0.0.1:8002;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5. 크론잡 등록 (매일 새벽 3시 평가)

```bash
crontab -e
# 추가:
0 3 * * * cd /home/ec2-user/fde1/fde-backend && /usr/local/bin/python3 -m jobs.evaluate >> /var/log/fde-evaluate.log 2>&1
```

## 6. 이후 배포

```bash
# 로컬에서
./deploy.sh fde-backend
```
