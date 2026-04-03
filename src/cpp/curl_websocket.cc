#include "curl_napi.h"

/**
 * wsRecv(easyHandle: CurlEasy, bufferSize?: number): { data: Buffer, flags: number, bytesleft: number }
 */
Napi::Value WsRecv(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Expected CurlEasy instance").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  CurlEasy* easy = CurlEasy::Unwrap(info[0].As<Napi::Object>());
  if (!easy || !easy->GetHandle()) {
    Napi::Error::New(env, "Invalid CurlEasy handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  size_t buflen = 65536;
  if (info.Length() > 1 && info[1].IsNumber()) {
    buflen = info[1].As<Napi::Number>().Uint32Value();
  }

  std::vector<char> buffer(buflen);
  size_t recv_len = 0;
  const struct curl_ws_frame* meta = nullptr;

  CURLcode code = curl_ws_recv(easy->GetHandle(), buffer.data(), buflen, &recv_len, &meta);

  Napi::Object result = Napi::Object::New(env);
  result.Set("code", Napi::Number::New(env, static_cast<int>(code)));

  if (code == CURLE_OK && recv_len > 0) {
    result.Set("data", Napi::Buffer<char>::Copy(env, buffer.data(), recv_len));
    if (meta) {
      result.Set("flags", Napi::Number::New(env, meta->flags));
      result.Set("bytesleft", Napi::Number::New(env, static_cast<double>(meta->bytesleft)));
      result.Set("offset", Napi::Number::New(env, static_cast<double>(meta->offset)));
    }
  } else {
    result.Set("data", env.Null());
  }

  return result;
}

/**
 * wsSend(easyHandle: CurlEasy, data: Buffer, flags: number): number
 */
Napi::Value WsSend(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected (easyHandle, data, flags)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  CurlEasy* easy = CurlEasy::Unwrap(info[0].As<Napi::Object>());
  if (!easy || !easy->GetHandle()) {
    Napi::Error::New(env, "Invalid CurlEasy handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<char> buffer = info[1].As<Napi::Buffer<char>>();
  unsigned int flags = info[2].As<Napi::Number>().Uint32Value();

  size_t sent = 0;
  CURLcode code = curl_ws_send(
    easy->GetHandle(),
    buffer.Data(),
    buffer.Length(),
    &sent,
    0,  // fragsize
    flags
  );

  return Napi::Number::New(env, static_cast<int>(code));
}
