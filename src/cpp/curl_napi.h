#ifndef CURL_NAPI_H
#define CURL_NAPI_H

#include <napi.h>
#include <curl/curl.h>
#include <curl/easy.h>
#include <curl/multi.h>
#include <curl/websockets.h>
#include "curl_impersonate.h"
#include <uv.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <functional>
#include <memory>
#include <mutex>

/**
 * CurlEasy: wraps a single curl_easy handle.
 * Exposes setopt, getinfo, perform (sync), impersonate, and reset.
 */
class CurlEasy : public Napi::ObjectWrap<CurlEasy> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  CurlEasy(const Napi::CallbackInfo& info);
  ~CurlEasy();

  CURL* GetHandle() { return curl_; }

  // Buffer accessors for after perform
  const std::string& GetResponseBody() const { return response_body_; }
  const std::string& GetResponseHeaders() const { return response_headers_; }
  void ClearBuffers();

private:
  CURL* curl_;
  struct curl_slist* headers_list_;
  struct curl_slist* resolve_list_;
  std::string response_body_;
  std::string response_headers_;

  // N-API methods
  Napi::Value SetoptString(const Napi::CallbackInfo& info);
  Napi::Value SetoptLong(const Napi::CallbackInfo& info);
  Napi::Value SetoptSlist(const Napi::CallbackInfo& info);
  Napi::Value GetinfoString(const Napi::CallbackInfo& info);
  Napi::Value GetinfoLong(const Napi::CallbackInfo& info);
  Napi::Value GetinfoDouble(const Napi::CallbackInfo& info);
  Napi::Value Perform(const Napi::CallbackInfo& info);
  Napi::Value Impersonate(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);
  Napi::Value GetResponseBody(const Napi::CallbackInfo& info);
  Napi::Value GetResponseHeaders(const Napi::CallbackInfo& info);
  void Cleanup(const Napi::CallbackInfo& info);
  Napi::Value Duphandle(const Napi::CallbackInfo& info);
  Napi::Value Upkeep(const Napi::CallbackInfo& info);

  void SetupCallbacks();

  // curl callbacks
  static size_t WriteCallback(void* ptr, size_t size, size_t nmemb, void* userdata);
  static size_t HeaderCallback(void* ptr, size_t size, size_t nmemb, void* userdata);
};

/**
 * SocketContext: tracks a single socket's uv_poll handle for CurlMulti.
 */
struct SocketContext {
  uv_poll_t poll_handle;
  curl_socket_t sockfd;
};

/**
 * TransferContext: tracks a single in-flight transfer.
 * Holds the CurlEasy ref and a JS promise to resolve on completion.
 */
struct TransferContext {
  Napi::ObjectReference easy_ref;
  Napi::Promise::Deferred deferred;
  TransferContext(Napi::Env env, Napi::Object easy_obj)
    : easy_ref(Napi::Persistent(easy_obj)), deferred(Napi::Promise::Deferred::New(env)) {}
};

/**
 * CurlMulti: wraps curl_multi with libuv event loop integration.
 * Provides async perform via Promises.
 */
class CurlMulti : public Napi::ObjectWrap<CurlMulti> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  CurlMulti(const Napi::CallbackInfo& info);
  ~CurlMulti();

private:
  CURLM* multi_;
  uv_timer_t timeout_timer_;
  std::unordered_map<curl_socket_t, SocketContext*> sockets_;
  std::unordered_map<CURL*, std::unique_ptr<TransferContext>> transfers_;
  Napi::Env env_;
  bool closed_;

  // N-API methods
  Napi::Value PerformAsync(const Napi::CallbackInfo& info);
  void Close(const Napi::CallbackInfo& info);

  // Internal
  void CheckMultiInfo();

  // curl_multi callbacks
  static int SocketCallback(CURL* easy, curl_socket_t s, int action, void* userp, void* socketp);
  static int TimerCallback(CURLM* multi, long timeout_ms, void* userp);

  // uv callbacks
  static void OnTimeout(uv_timer_t* handle);
  static void OnPoll(uv_poll_t* handle, int status, int events);
};

// WebSocket functions
Napi::Value WsRecv(const Napi::CallbackInfo& info);
Napi::Value WsSend(const Napi::CallbackInfo& info);

// Module-level functions
Napi::Value CurlVersion(const Napi::CallbackInfo& info);
Napi::Value GlobalInit(const Napi::CallbackInfo& info);
Napi::Value GlobalCleanup(const Napi::CallbackInfo& info);

#endif // CURL_NAPI_H
