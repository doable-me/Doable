#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImRlbGV0ZXRlc3RAZG9hYmxlLm1lIiwic3ViIjoiZDk3YWUwZTgtYWU5MC00NDNhLWEzYmMtODcwM2FiNDllYmJiIiwiaXNzIjoiZG9hYmxlIiwiaWF0IjoxNzc3Mjc1NTM1LCJleHAiOjE3NzcyODk5MzV9.dqA3jH-3ap1_UdxemOf5s_HoaiDxdaJgeNB8P-OQim8"
WS_ID="fec03cb2-b730-413b-b083-9a028bb018d6"
USER_ID="d97ae0e8-ae90-443a-a3bc-8703ab49ebbb"

echo "=== Step 1: Create project ==="
CREATE_RESULT=$(curl -s -X POST http://127.0.0.1:4000/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Delete With Usage\",\"workspaceId\":\"$WS_ID\"}")
echo "$CREATE_RESULT"

PROJECT_ID=$(echo "$CREATE_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Project ID: $PROJECT_ID"

echo ""
echo "=== Step 2: Insert AI usage rows that would cause conflict ==="
# Insert a row with project_id (will be set to NULL on cascade)
sudo -u postgres psql -d doable -c "
  INSERT INTO ai_usage_daily (date, user_id, workspace_id, project_id, provider, model, request_count)
  VALUES (CURRENT_DATE, '$USER_ID', '$WS_ID', '$PROJECT_ID', 'test-provider', 'test-model', 5);
"
# Insert a row with NULL project_id (same key minus project_id) - this creates the conflict
sudo -u postgres psql -d doable -c "
  INSERT INTO ai_usage_daily (date, user_id, workspace_id, project_id, provider, model, request_count)
  VALUES (CURRENT_DATE, '$USER_ID', '$WS_ID', NULL, 'test-provider', 'test-model', 3);
"

# Same for monthly
sudo -u postgres psql -d doable -c "
  INSERT INTO ai_usage_monthly (month, user_id, workspace_id, project_id, provider, model, request_count)
  VALUES (date_trunc('month', CURRENT_DATE), '$USER_ID', '$WS_ID', '$PROJECT_ID', 'test-provider', 'test-model', 10);
"
sudo -u postgres psql -d doable -c "
  INSERT INTO ai_usage_monthly (month, user_id, workspace_id, project_id, provider, model, request_count)
  VALUES (date_trunc('month', CURRENT_DATE), '$USER_ID', '$WS_ID', NULL, 'test-provider', 'test-model', 7);
"

echo ""
echo "=== Step 3: Verify conflicting rows exist ==="
sudo -u postgres psql -d doable -c "
  SELECT project_id IS NULL as is_null, request_count FROM ai_usage_daily 
  WHERE user_id = '$USER_ID' AND provider = 'test-provider' AND model = 'test-model';
"

echo ""
echo "=== Step 4: Try to delete project (this is the real test) ==="
DELETE_RESULT=$(curl -s -w "\nHTTP_STATUS: %{http_code}" -X DELETE "http://127.0.0.1:4000/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$DELETE_RESULT"

echo ""
echo "=== Step 5: Verify project is gone ==="
GET_RESULT=$(curl -s "http://127.0.0.1:4000/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$GET_RESULT"

echo ""
echo "=== Step 6: Check usage rows merged correctly ==="
sudo -u postgres psql -d doable -c "
  SELECT project_id IS NULL as is_null, request_count FROM ai_usage_daily 
  WHERE user_id = '$USER_ID' AND provider = 'test-provider' AND model = 'test-model';
"

echo ""
echo "=== Cleanup test data ==="
sudo -u postgres psql -d doable -c "
  DELETE FROM ai_usage_daily WHERE user_id = '$USER_ID' AND provider = 'test-provider';
  DELETE FROM ai_usage_monthly WHERE user_id = '$USER_ID' AND provider = 'test-provider';
"
