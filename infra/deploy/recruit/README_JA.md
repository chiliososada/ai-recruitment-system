# recruit.toyousoft.co.jp デプロイ手順(HPE / 自己ホスト Supabase)

構成: host Kong(443) → 127.0.0.1:56300(web) / 56301(api /api/)。
Supabase(GoTrue+Storage+Postgres/pgvector)・ClamAV は compose 内部で完結する。

## 初回
```bash
cd ~/recruit && git clone git@github.com:chiliososada/ai-recruitment-system.git
cd ai-recruitment-system/infra/deploy/recruit
python3 gen-keys.py > .env          # 秘密鍵4種を生成
tail -n +6 .env.example >> .env     # AI_PROVIDER 等の残り変数を追記
./deploy.sh                         # db→supabase→migrate→api/web→smoke
./kong-setup.sh                     # Kong に service/route を追加(冪等)
docker run --rm -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/certbot/web:/var/certbot/web certbot/certbot certonly \
  --webroot -w /var/certbot/web -n --agree-tos \
  -d recruit.toyousoft.co.jp -d www.recruit.toyousoft.co.jp \
  --cert-name recruit.toyousoft.co.jp
sudo ./kong-cert.sh                 # 証明書を Kong へ登録
```

## 更新時
```bash
git pull --ff-only && ./deploy.sh   # 迁移は追跡表で冪等、無停止再起動
```

## 証明書更新(90日毎)
```bash
docker run --rm -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/certbot/web:/var/certbot/web certbot/certbot renew
sudo ~/recruit/ai-recruitment-system/infra/deploy/recruit/kong-cert.sh
```

## 備考
- AI は初期値 mock(決定論・外部呼出なし)。本物に切替える際は .env の
  AI_PROVIDER=anthropic / EMBEDDING_PROVIDER=openai と各 API キーを設定し
  `docker compose -f docker-compose.prod.yml --env-file .env up -d api`。
  ※ 埋め込みprovider切替後はマッチング再計算が必要(初期データ僅少なら影響軽微)。
- メールは GOTRUE_MAILER_AUTOCONFIRM=true(SMTP 未接続)。onamae の SMTP を
  つなぐ場合は auth サービスの GOTRUE_SMTP_* を設定して autoconfirm を外す。
- ポート割当: 56300 web / 56301 api / 56310 db(全て 127.0.0.1 バインド)。
