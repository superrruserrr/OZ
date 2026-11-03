DROP FUNCTION oz_personal_data_export(uuid, text);
DROP FUNCTION oz_data_export_request();
DROP POLICY "notifications_privileged_read" ON "notifications";
DROP POLICY "kyc_cases_privileged_read" ON "kyc_cases";
DROP TABLE "data_export_requests";
