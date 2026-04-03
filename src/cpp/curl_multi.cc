#include "curl_napi.h"

Napi::Object CurlMulti::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "CurlMulti", {
    InstanceMethod("performAsync", &CurlMulti::PerformAsync),
    InstanceMethod("close", &CurlMulti::Close),
  });

  exports.Set("CurlMulti", func);
  return exports;
}

CurlMulti::CurlMulti(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<CurlMulti>(info), env_(info.Env()), closed_(false) {
  multi_ = curl_multi_init();
  if (!multi_) {
    Napi::Error::New(info.Env(), "Failed to initialize curl multi handle").ThrowAsJavaScriptException();
    return;
  }

  // Initialize libuv timer for curl_multi timeouts
  uv_loop_t* loop;
  napi_get_uv_event_loop(info.Env(), &loop);

  uv_timer_init(loop, &timeout_timer_);
  timeout_timer_.data = this;

  // Set curl_multi socket and timer callbacks
  curl_multi_setopt(multi_, CURLMOPT_SOCKETFUNCTION, SocketCallback);
  curl_multi_setopt(multi_, CURLMOPT_SOCKETDATA, this);
  curl_multi_setopt(multi_, CURLMOPT_TIMERFUNCTION, TimerCallback);
  curl_multi_setopt(multi_, CURLMOPT_TIMERDATA, this);
}

CurlMulti::~CurlMulti() {
  if (!closed_) {
    // Clean up sockets
    for (auto& [sockfd, ctx] : sockets_) {
      uv_poll_stop(&ctx->poll_handle);
      delete ctx;
    }
    sockets_.clear();

    uv_timer_stop(&timeout_timer_);
    uv_close(reinterpret_cast<uv_handle_t*>(&timeout_timer_), nullptr);

    if (multi_) {
      curl_multi_cleanup(multi_);
      multi_ = nullptr;
    }
    closed_ = true;
  }
}

/**
 * performAsync(easyHandle: CurlEasy): Promise<number>
 * Adds an easy handle to the multi and returns a Promise that resolves
 * when the transfer completes with the CURLcode result.
 */
Napi::Value CurlMulti::PerformAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (closed_) {
    Napi::Error::New(env, "CurlMulti is closed").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Expected CurlEasy instance").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Object easy_obj = info[0].As<Napi::Object>();
  CurlEasy* easy = CurlEasy::Unwrap(easy_obj);
  if (!easy || !easy->GetHandle()) {
    Napi::Error::New(env, "Invalid CurlEasy handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Clear response buffers before new request
  easy->ClearBuffers();

  auto ctx = std::make_unique<TransferContext>(env, easy_obj);
  Napi::Promise promise = ctx->deferred.Promise();

  CURL* handle = easy->GetHandle();
  // Store private pointer so we can look up the context in CheckMultiInfo
  curl_easy_setopt(handle, CURLOPT_PRIVATE, handle);

  transfers_[handle] = std::move(ctx);

  CURLMcode rc = curl_multi_add_handle(multi_, handle);
  if (rc != CURLM_OK) {
    auto it = transfers_.find(handle);
    if (it != transfers_.end()) {
      it->second->deferred.Reject(
        Napi::Error::New(env, curl_multi_strerror(rc)).Value()
      );
      transfers_.erase(it);
    }
  }

  return promise;
}

void CurlMulti::Close(const Napi::CallbackInfo& info) {
  if (closed_) return;
  closed_ = true;

  // Reject all pending transfers
  for (auto& [handle, ctx] : transfers_) {
    curl_multi_remove_handle(multi_, handle);
    ctx->deferred.Reject(
      Napi::Error::New(info.Env(), "CurlMulti closed").Value()
    );
  }
  transfers_.clear();

  // Clean up sockets
  for (auto& [sockfd, ctx] : sockets_) {
    uv_poll_stop(&ctx->poll_handle);
    delete ctx;
  }
  sockets_.clear();

  uv_timer_stop(&timeout_timer_);
  uv_close(reinterpret_cast<uv_handle_t*>(&timeout_timer_), nullptr);

  if (multi_) {
    curl_multi_cleanup(multi_);
    multi_ = nullptr;
  }
}

/**
 * Check for completed transfers and resolve/reject their promises.
 */
void CurlMulti::CheckMultiInfo() {
  CURLMsg* msg;
  int msgs_left;

  while ((msg = curl_multi_info_read(multi_, &msgs_left))) {
    if (msg->msg == CURLMSG_DONE) {
      CURL* easy_handle = msg->easy_handle;
      CURLcode result = static_cast<CURLcode>(msg->data.result);

      curl_multi_remove_handle(multi_, easy_handle);

      auto it = transfers_.find(easy_handle);
      if (it != transfers_.end()) {
        auto& ctx = it->second;
        if (result == CURLE_OK) {
          ctx->deferred.Resolve(Napi::Number::New(env_, 0));
        } else {
          std::string err_msg = "curl error " + std::to_string(result) + ": " +
                                curl_easy_strerror(result);
          ctx->deferred.Reject(Napi::Error::New(env_, err_msg).Value());
        }
        transfers_.erase(it);
      }
    }
  }
}

/**
 * curl_multi socket callback: called when curl wants to watch/unwatch a socket.
 */
int CurlMulti::SocketCallback(CURL* easy, curl_socket_t s, int action, void* userp, void* socketp) {
  auto* self = static_cast<CurlMulti*>(userp);
  if (self->closed_) return 0;

  if (action == CURL_POLL_REMOVE) {
    auto it = self->sockets_.find(s);
    if (it != self->sockets_.end()) {
      uv_poll_stop(&it->second->poll_handle);
      delete it->second;
      self->sockets_.erase(it);
    }
    curl_multi_assign(self->multi_, s, nullptr);
    return 0;
  }

  SocketContext* ctx;
  auto it = self->sockets_.find(s);
  if (it == self->sockets_.end()) {
    // New socket
    ctx = new SocketContext();
    ctx->sockfd = s;

    uv_loop_t* loop;
    napi_get_uv_event_loop(self->env_, &loop);
    uv_poll_init_socket(loop, &ctx->poll_handle, s);
    ctx->poll_handle.data = self;

    self->sockets_[s] = ctx;
    curl_multi_assign(self->multi_, s, ctx);
  } else {
    ctx = it->second;
  }

  int events = 0;
  if (action & CURL_POLL_IN)  events |= UV_READABLE;
  if (action & CURL_POLL_OUT) events |= UV_WRITABLE;

  uv_poll_start(&ctx->poll_handle, events, OnPoll);
  return 0;
}

/**
 * curl_multi timer callback: called when curl wants a timeout.
 */
int CurlMulti::TimerCallback(CURLM* multi, long timeout_ms, void* userp) {
  auto* self = static_cast<CurlMulti*>(userp);
  if (self->closed_) return 0;

  if (timeout_ms < 0) {
    uv_timer_stop(&self->timeout_timer_);
  } else {
    // Use at least 1ms to avoid busy-looping
    if (timeout_ms == 0) timeout_ms = 1;
    uv_timer_start(&self->timeout_timer_, OnTimeout, timeout_ms, 0);
  }
  return 0;
}

/**
 * libuv timer callback: fires when curl_multi timeout expires.
 */
void CurlMulti::OnTimeout(uv_timer_t* handle) {
  auto* self = static_cast<CurlMulti*>(handle->data);
  if (self->closed_) return;

  int running_handles;
  curl_multi_socket_action(self->multi_, CURL_SOCKET_TIMEOUT, 0, &running_handles);
  self->CheckMultiInfo();
}

/**
 * libuv poll callback: fires when a socket has activity.
 */
void CurlMulti::OnPoll(uv_poll_t* handle, int status, int events) {
  auto* self = static_cast<CurlMulti*>(handle->data);
  if (self->closed_) return;

  // Find the socket fd from our map
  curl_socket_t sockfd = CURL_SOCKET_BAD;
  for (auto& [fd, ctx] : self->sockets_) {
    if (&ctx->poll_handle == handle) {
      sockfd = fd;
      break;
    }
  }
  if (sockfd == CURL_SOCKET_BAD) return;

  int flags = 0;
  if (status < 0) {
    flags = CURL_CSELECT_ERR;
  } else {
    if (events & UV_READABLE) flags |= CURL_CSELECT_IN;
    if (events & UV_WRITABLE) flags |= CURL_CSELECT_OUT;
  }

  int running_handles;
  curl_multi_socket_action(self->multi_, sockfd, flags, &running_handles);
  self->CheckMultiInfo();
}
