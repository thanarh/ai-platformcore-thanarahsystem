#!/usr/bin/env bash
set -Eeuo pipefail

MODEL="${LOCAL_AI_MODEL:-qwen2.5:7b}"
BASE_URL="${LOCAL_AI_BASE_URL:-http://127.0.0.1:11434}"
RESULTS="${1:-/tmp/thanarah-local-model-benchmark.tsv}"

printf 'threads\ttotal_seconds\teval_count\teval_tokens_per_second\tresponse\n' > "$RESULTS"

for threads in 4 6 8 12; do
  request_file="/tmp/thanarah-benchmark-${threads}.json"
  response_file="/tmp/thanarah-benchmark-${threads}-response.json"
  cat > "$request_file" <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role": "system", "content": "أنت ثنارة، مساعد عربي. أجب مباشرة بجملة مفيدة قصيرة."},
    {"role": "user", "content": "اذكر فائدتين واضحتين لقاعدة المعرفة في خدمة العملاء."}
  ],
  "stream": false,
  "keep_alive": -1,
  "options": {
    "num_predict": 80,
    "num_ctx": 4096,
    "num_thread": $threads,
    "num_batch": 128,
    "temperature": 0.3,
    "top_p": 0.9,
    "repeat_penalty": 1.1
  }
}
JSON
  total="$(curl -fsS --max-time 180 -H 'Content-Type: application/json' --data-binary "@$request_file" -o "$response_file" -w '%{time_total}' "$BASE_URL/api/chat")"
  metrics="$(python3 - "$response_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    data = json.load(handle)
count = int(data.get('eval_count') or 0)
duration = int(data.get('eval_duration') or 0)
rate = count / (duration / 1_000_000_000) if duration else 0
response = str(data.get('message', {}).get('content', '')).replace('\t', ' ').replace('\n', ' ')
print(f"{count}\t{rate:.2f}\t{response}")
PY
)"
  printf '%s\t%s\t%s\n' "$threads" "$total" "$metrics" >> "$RESULTS"
done

cat "$RESULTS"
