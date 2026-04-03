#ifndef CURL_IMPERSONATE_H
#define CURL_IMPERSONATE_H

#include <curl/curl.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * curl_easy_impersonate: set TLS/HTTP fingerprint to match a browser.
 * Declared here because this is a curl-impersonate extension, not in standard curl headers.
 */
CURLcode curl_easy_impersonate(CURL* curl, const char* target, int default_headers);

/**
 * curl_easy_impersonate_customized: impersonate with fine-grained control.
 */
CURLcode curl_easy_impersonate_customized(CURL* curl, const char* target, int default_headers);

#ifdef __cplusplus
}
#endif

#endif // CURL_IMPERSONATE_H
