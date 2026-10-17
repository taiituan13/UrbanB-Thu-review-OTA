#!/bin/bash
# Chạy: tools/do-quay/build.sh rồi node tools/do-quay/run.mjs (PLAYWRIGHT_MODULE=<…/playwright/index.mjs> nếu chưa cài).
# Bản dựng đo: chép extension, ghi đè env.js trỏ Hub giả + Apps Script giả ở localhost, bật nguồn thông báo giả.
set -e
D=$(cd "$(dirname "$0")" && pwd)
SRC="$D/../../extension"
PORT=${PORT:-47821}
rm -rf "$D/ext" && cp -R "$SRC" "$D/ext"
cat > "$D/ext/env.js" <<EOT
export const HUB_ORIGINS = ["http://localhost:$PORT"];
export const DEFAULT_HUB_ORIGIN = "http://localhost:$PORT";
export const HUB_LABELS = { "http://localhost:$PORT": "Hub giả (đo)" };
export const APPS_SCRIPT_URL_RE = /^http:\/\/localhost:$PORT\/macros\/s\/[\w-]+\/exec\$/;
export const DEV_FLAGS = { fakeNotifications: true };
EOT
python3 - "$D/ext" <<'PY'
import json,sys,re
d=sys.argv[1]
m=json.load(open(d+'/manifest.json')); m['host_permissions'].append('http://localhost/*'); json.dump(m,open(d+'/manifest.json','w'),indent=1)
p=d+'/quay/notifications.js'; s=open(p).read(); s=s.replace('NOTIFICATIONS_POLL_MS = 60_000','NOTIFICATIONS_POLL_MS = 2000'); open(p,'w').write(s)
p=d+'/quay/sw.js'; s=open(p).read(); s+='\nself.__doNoti = () => notiSource();\n'; open(p,'w').write(s)
PY
echo "built $D/ext"
