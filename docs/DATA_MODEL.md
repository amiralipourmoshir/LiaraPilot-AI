# طراحی مدل داده

این سند طرح منطقی هدف است؛ auth/صف در فاز ۲، اتصال/credential/application در فاز ۴ و Conversation/ChatMessage/ChatRun/AssistantPlan/AssistantEvidence در فاز ۵ پیاده شده‌اند. نام و ستون واقعی در prisma/schema.prisma مرجع است؛ تمام موجودیت‌های جدول هدف زیر ساخته نشده‌اند. پایش و deployment هنوز طراحی‌اند. شناسه‌ها UUID، زمان‌ها timestamptz در UTC و نمایش مطابق منطقه زمانی کاربر؛ mode enum برابر DEMO/LIVE است.

| موجودیت | ستون‌های کلیدی | ارتباط و قید مهم |
|---|---|---|
| User | id, emailNormalized, passwordHash, createdAt | email یکتا؛ hash امن با Argon2id |
| Session | idHash, userId, expiresAt, revokedAt | نشست خام در DB ذخیره نشود؛ index انقضا |
| ProviderConnection | id, userId, provider, mode, teamRef, status | مالکیت کاربر؛ اتصال قطع‌شده قابل اجرا نیست |
| Credential | id, connectionId, ciphertext, nonce, authTag, keyVersion, version | AES-256-GCM، کلید بیرون DB؛ اتصال یکتا به نسخه فعال |
| Project | id, userId, mode, repositoryUrl, branch, commitSha | تحلیل و انتشار به commit ثابت متصل |
| Application | id, userId, connectionId, mode, providerId, name | unique(connectionId, providerId)؛ نام و شناسه provider جدا |
| Conversation | id, userId, applicationId?, mode, title | application متعلق به همان کاربر و mode |
| Message | id, conversationId, role, redactedContent, createdAt | index(conversationId, createdAt)؛ اسرار ممنوع |
| ToolExecution | id, operationId?, conversationId, name, redactedArgs, result, status | ورودی معتبر، correlationId و زمان اجرا |
| DeploymentPlan | id, userId, applicationId, commitSha, revision, paramsHash, policyVersion | immutable؛ تنظیمات حساس فقط reference/version |
| Deployment | id, operationId, planId, providerReleaseId?, status | operation یکتا؛ نتیجه واقعی جدا از پذیرش درخواست |
| Operation | id, userId, applicationId?, mode, type, state, idempotencyKey, requestHash, attempt, version, result?, verification? | unique(userId, mode, idempotencyKey)؛ index(state, updatedAt) |
| OperationEvent | id, operationId, sequence, type, payload, createdAt | unique(operationId, sequence)؛ payload پاکسازی‌شده |
| Approval | id, operationId, userId, paramsHash, policyVersion, expiresAt, consumedAt?, decision | مصرف اتمیک یک‌بار؛ تغییر پارامتر باعث رد |
| OutboxEvent | id, operationId, type, publishedAt?, attempts | درج همراه operation؛ ارسال قابل تکرار |
| HealthCheck | id, applicationId, source, checkedAt, statusCode?, latencyMs?, assertionResult, error? | index(applicationId, checkedAt)؛ آدرس تأییدشده |
| Metric | id, applicationId, source, metricName, unit, sampledAt, value | واحد و timestamp معتبر؛ منبع demo مستقل |
| Incident | id, applicationId, userId, mode, fingerprint, state, openedAt, resolvedAt? | partial unique روی fingerprint برای رخداد باز |
| IncidentEvidence | id, incidentId, source, observedAt, collectedAt, redactedPayload, contentHash | شواهد immutable؛ محدودیت اندازه |
| Diagnosis | id, incidentId, evidenceIds, hypotheses, missingEvidence, modelMetadata | شواهد متعلق به همان incident؛ confidence تخمینی |
| Remediation | id, incidentId, operationId, diagnosisId, verificationSummary | اجرای اصلاح از operation و approval عبور می‌کند |
| AuditLog | id, userId, operationId?, action, redactedMetadata, correlationId, createdAt | append-only؛ index(userId, createdAt) |

FKهای مرکب یا guardهای تراکنشی باید userId/mode را در روابط حفظ کنند؛ UUID به‌تنهایی مجوز نیست. حذف کاربر ابتدا اتصال‌ها و نشست‌ها را لغو، عملیات فعال را متوقف/تعیین تکلیف و credential را حذف می‌کند. پاک‌سازی تاریخچه عملیاتی با retention انجام می‌شود؛ cascade روی operation فعال ممنوع است.

سیاست اولیه قابل تنظیم: لاگ خام پاکسازی‌شده ۷ روز، metrics/health سی روز، گفتگو و نتایج ۹۰ روز، audit حداقل ۱۸۰ روز. این‌ها تصمیم محصول پیشنهادی‌اند؛ ادعای الزام قانونی ندارند. job پاک‌سازی با audit شمارشی و بدون اسرار اجرا می‌شود. نسخه‌بندی کلید و بازیابی backup باید پیش از Live تست شوند.

## وضعیت اجرایی فاز ۴

در migration فاز ۴ مدل‌های ProviderConnection، Credential و Application اضافه شده‌اند. ciphertext/nonce/authTag با AAD مالک و نسخه ذخیره می‌شوند؛ FK مرکب مالکیت سرویس و اتصال را اعمال می‌کند. قطع اتصال credential را حذف و نسخه اتصال را تغییر می‌دهد.

## وضعیت اجرایی فاز ۵

مدل‌های Conversation، ChatMessage، ChatRun، AssistantPlan و AssistantEvidence اکنون با migration 20261023121019_assistant_approval پیاده‌اند. مالکیت از Conversation.userId و FKها برقرار است. lease گفتگو، کلید idempotency، snapshot/hash/انقضا و evidence پایدارند.

## وضعیت اجرایی فاز ۶

Conversation.model و ChatMessage.actionPath، Deployment، DeploymentEvent، DeploymentOutbox و DeploymentLease اضافه شدند. طرح snapshot/hash، provider source/release IDs و رویدادهای ترتیبی دارد. lease یکتای applicationId در تراکنش تأیید گرفته می‌شود و outbox فقط deploymentId را به صف می‌برد. schema مرجع واقعی شش migration دارد؛ جدول‌های Incident و Monitoring هنوز طراحی‌اند.
