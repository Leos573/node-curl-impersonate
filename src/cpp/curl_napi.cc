#include "curl_napi.h"

Napi::Value CurlVersion(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), curl_version());
}

Napi::Value GlobalInit(const Napi::CallbackInfo& info) {
  CURLcode code = curl_global_init(CURL_GLOBAL_ALL);
  return Napi::Number::New(info.Env(), static_cast<int>(code));
}

Napi::Value GlobalCleanup(const Napi::CallbackInfo& info) {
  curl_global_cleanup();
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // Initialize curl globally
  curl_global_init(CURL_GLOBAL_ALL);

  // Register classes
  CurlEasy::Init(env, exports);
  CurlMulti::Init(env, exports);

  // Register functions
  exports.Set("curlVersion", Napi::Function::New(env, CurlVersion));
  exports.Set("globalInit", Napi::Function::New(env, GlobalInit));
  exports.Set("globalCleanup", Napi::Function::New(env, GlobalCleanup));
  exports.Set("wsRecv", Napi::Function::New(env, WsRecv));
  exports.Set("wsSend", Napi::Function::New(env, WsSend));

  // Export curl option constants
  Napi::Object opts = Napi::Object::New(env);

  // Most commonly used CURLOPT constants
  opts.Set("URL", Napi::Number::New(env, CURLOPT_URL));
  opts.Set("HTTPHEADER", Napi::Number::New(env, CURLOPT_HTTPHEADER));
  opts.Set("POST", Napi::Number::New(env, CURLOPT_POST));
  opts.Set("POSTFIELDS", Napi::Number::New(env, CURLOPT_POSTFIELDS));
  opts.Set("POSTFIELDSIZE", Napi::Number::New(env, CURLOPT_POSTFIELDSIZE));
  opts.Set("CUSTOMREQUEST", Napi::Number::New(env, CURLOPT_CUSTOMREQUEST));
  opts.Set("FOLLOWLOCATION", Napi::Number::New(env, CURLOPT_FOLLOWLOCATION));
  opts.Set("MAXREDIRS", Napi::Number::New(env, CURLOPT_MAXREDIRS));
  opts.Set("TIMEOUT_MS", Napi::Number::New(env, CURLOPT_TIMEOUT_MS));
  opts.Set("CONNECTTIMEOUT_MS", Napi::Number::New(env, CURLOPT_CONNECTTIMEOUT_MS));
  opts.Set("SSL_VERIFYPEER", Napi::Number::New(env, CURLOPT_SSL_VERIFYPEER));
  opts.Set("SSL_VERIFYHOST", Napi::Number::New(env, CURLOPT_SSL_VERIFYHOST));
  opts.Set("PROXY", Napi::Number::New(env, CURLOPT_PROXY));
  opts.Set("PROXYUSERPWD", Napi::Number::New(env, CURLOPT_PROXYUSERPWD));
  opts.Set("COOKIE", Napi::Number::New(env, CURLOPT_COOKIE));
  opts.Set("COOKIEFILE", Napi::Number::New(env, CURLOPT_COOKIEFILE));
  opts.Set("COOKIEJAR", Napi::Number::New(env, CURLOPT_COOKIEJAR));
  opts.Set("COOKIELIST", Napi::Number::New(env, CURLOPT_COOKIELIST));
  opts.Set("USERAGENT", Napi::Number::New(env, CURLOPT_USERAGENT));
  opts.Set("ENCODING", Napi::Number::New(env, CURLOPT_ACCEPT_ENCODING));
  opts.Set("HTTP_VERSION", Napi::Number::New(env, CURLOPT_HTTP_VERSION));
  opts.Set("NOBODY", Napi::Number::New(env, CURLOPT_NOBODY));
  opts.Set("HTTPGET", Napi::Number::New(env, CURLOPT_HTTPGET));
  opts.Set("UPLOAD", Napi::Number::New(env, CURLOPT_UPLOAD));
  opts.Set("PUT", Napi::Number::New(env, CURLOPT_UPLOAD));
  opts.Set("VERBOSE", Napi::Number::New(env, CURLOPT_VERBOSE));
  opts.Set("CAINFO", Napi::Number::New(env, CURLOPT_CAINFO));
  opts.Set("CAPATH", Napi::Number::New(env, CURLOPT_CAPATH));
  opts.Set("INTERFACE", Napi::Number::New(env, CURLOPT_INTERFACE));
  opts.Set("RESOLVE", Napi::Number::New(env, CURLOPT_RESOLVE));
  opts.Set("PRIVATE", Napi::Number::New(env, CURLOPT_PRIVATE));
  opts.Set("SSLCERT", Napi::Number::New(env, CURLOPT_SSLCERT));
  opts.Set("SSLKEY", Napi::Number::New(env, CURLOPT_SSLKEY));
  opts.Set("REFERER", Napi::Number::New(env, CURLOPT_REFERER));
  exports.Set("CurlOpt", opts);

  // HTTP version constants
  Napi::Object httpVer = Napi::Object::New(env);
  httpVer.Set("V1_1", Napi::Number::New(env, CURL_HTTP_VERSION_1_1));
  httpVer.Set("V2_0", Napi::Number::New(env, CURL_HTTP_VERSION_2_0));
  httpVer.Set("V2TLS", Napi::Number::New(env, CURL_HTTP_VERSION_2TLS));
  httpVer.Set("V2_PRIOR", Napi::Number::New(env, CURL_HTTP_VERSION_2_PRIOR_KNOWLEDGE));
  httpVer.Set("V3", Napi::Number::New(env, CURL_HTTP_VERSION_3));
  exports.Set("CurlHttpVersion", httpVer);

  // CURLINFO constants
  Napi::Object curlInfo = Napi::Object::New(env);
  curlInfo.Set("RESPONSE_CODE", Napi::Number::New(env, CURLINFO_RESPONSE_CODE));
  curlInfo.Set("EFFECTIVE_URL", Napi::Number::New(env, CURLINFO_EFFECTIVE_URL));
  curlInfo.Set("CONTENT_TYPE", Napi::Number::New(env, CURLINFO_CONTENT_TYPE));
  curlInfo.Set("TOTAL_TIME", Napi::Number::New(env, CURLINFO_TOTAL_TIME));
  curlInfo.Set("REDIRECT_COUNT", Napi::Number::New(env, CURLINFO_REDIRECT_COUNT));
  curlInfo.Set("PRIMARY_IP", Napi::Number::New(env, CURLINFO_PRIMARY_IP));
  curlInfo.Set("HTTP_VERSION", Napi::Number::New(env, CURLINFO_HTTP_VERSION));
  curlInfo.Set("SIZE_DOWNLOAD_T", Napi::Number::New(env, CURLINFO_SIZE_DOWNLOAD_T));
  curlInfo.Set("SIZE_UPLOAD_T", Napi::Number::New(env, CURLINFO_SIZE_UPLOAD_T));
  exports.Set("CurlInfo", curlInfo);

  // WebSocket flags
  Napi::Object wsFlags = Napi::Object::New(env);
  wsFlags.Set("TEXT", Napi::Number::New(env, CURLWS_TEXT));
  wsFlags.Set("BINARY", Napi::Number::New(env, CURLWS_BINARY));
  wsFlags.Set("CLOSE", Napi::Number::New(env, CURLWS_CLOSE));
  wsFlags.Set("PING", Napi::Number::New(env, CURLWS_PING));
  wsFlags.Set("PONG", Napi::Number::New(env, CURLWS_PONG));
  exports.Set("CurlWsFlag", wsFlags);

  // CURLcode error constants
  Napi::Object errors = Napi::Object::New(env);
  errors.Set("OK", Napi::Number::New(env, CURLE_OK));
  errors.Set("UNSUPPORTED_PROTOCOL", Napi::Number::New(env, CURLE_UNSUPPORTED_PROTOCOL));
  errors.Set("COULDNT_CONNECT", Napi::Number::New(env, CURLE_COULDNT_CONNECT));
  errors.Set("COULDNT_RESOLVE_HOST", Napi::Number::New(env, CURLE_COULDNT_RESOLVE_HOST));
  errors.Set("OPERATION_TIMEDOUT", Napi::Number::New(env, CURLE_OPERATION_TIMEDOUT));
  errors.Set("SSL_CONNECT_ERROR", Napi::Number::New(env, CURLE_SSL_CONNECT_ERROR));
  errors.Set("PEER_FAILED_VERIFICATION", Napi::Number::New(env, CURLE_PEER_FAILED_VERIFICATION));
  errors.Set("GOT_NOTHING", Napi::Number::New(env, CURLE_GOT_NOTHING));
  errors.Set("RECV_ERROR", Napi::Number::New(env, CURLE_RECV_ERROR));
  errors.Set("SEND_ERROR", Napi::Number::New(env, CURLE_SEND_ERROR));
  exports.Set("CurlCode", errors);

  return exports;
}

NODE_API_MODULE(curl_napi, Init)
