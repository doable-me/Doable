#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImRlbGV0ZXRlc3RAZG9hYmxlLm1lIiwic3ViIjoiZDk3YWUwZTgtYWU5MC00NDNhLWEzYmMtODcwM2FiNDllYmJiIiwiaXNzIjoiZG9hYmxlIiwiaWF0IjoxNzc3Mjc1NTM1LCJleHAiOjE3NzcyODk5MzV9.dqA3jH-3ap1_UdxemOf5s_HoaiDxdaJgeNB8P-OQim8"
WS_ID="fec03cb2-b730-413b-b083-9a028bb018d6"

echo "=== Step 1: Create project ==="
CREATE_RESULT=$(curl -s -X POST http://127.0.0.1:4000/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Delete Project\",\"workspaceId\":\"$WS_ID\"}")
echo "$CREATE_RESULT"

PROJECT_ID=$(echo "$CREATE_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Project ID: $PROJECT_ID"

if [ -z "$PROJECT_ID" ]; then
  echo "FAILED to create project"
  exit 1
fi

echo ""
echo "=== Step 2: Try to delete project ==="
DELETE_RESULT=$(curl -s -X DELETE "http://127.0.0.1:4000/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$DELETE_RESULT"

echo ""
echo "=== Step 3: Verify project is gone ==="
GET_RESULT=$(curl -s "http://127.0.0.1:4000/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$GET_RESULT"
