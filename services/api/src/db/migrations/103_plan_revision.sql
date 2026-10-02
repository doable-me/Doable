ALTER TABLE plans ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

-- Upgrade only the shipped legacy allowlists. Never overwrite a customized policy.
UPDATE mode_tool_config SET allowed_tools=ARRAY['read_file','list_files','search_files','ask_clarification','create_plan','get_plan','view','grep','glob','ask_user','report_intent'],updated_at=now()
WHERE mode='plan' AND allowed_tools=ARRAY['read_file','list_files','search_files','ask_clarification','create_plan','mark_step_complete','view','grep','glob','ask_user','report_intent'];
UPDATE mode_tool_config SET allowed_tools=array_append(array_append(allowed_tools,'get_plan'),'update_plan'),updated_at=now()
WHERE mode='build' AND allowed_tools=ARRAY['create_file','edit_file','read_file','list_files','install_package','deploy_preview','provision_supabase','request_integration','mark_step_complete','view','grep','glob','ask_user','report_intent','bash','edit'];
