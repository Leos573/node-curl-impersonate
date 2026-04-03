#include "curl_napi.h"

Napi::Object CurlEasy::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "CurlEasy", {
    InstanceMethod("setoptString", &CurlEasy::SetoptString),
    InstanceMethod("setoptLong", &CurlEasy::SetoptLong),
    InstanceMethod("setoptSlist", &CurlEasy::SetoptSlist),
    InstanceMethod("getinfoString", &CurlEasy::GetinfoString),
    InstanceMethod("getinfoLong", &CurlEasy::GetinfoLong),
    InstanceMethod("getinfoDouble", &CurlEasy::GetinfoDouble),
    InstanceMethod("perform", &CurlEasy::Perform),
    InstanceMethod("impersonate", &CurlEasy::Impersonate),
    InstanceMethod("reset", &CurlEasy::Reset),
    InstanceMethod("getResponseBody", &CurlEasy::GetResponseBody),
    InstanceMethod("getResponseHeaders", &CurlEasy::GetResponseHeaders),
    InstanceMethod("cleanup", &CurlEasy::Cleanup),
    InstanceMethod("duphandle", &CurlEasy::Duphandle),
    InstanceMethod("upkeep", &CurlEasy::Upkeep),
  });

  Napi::FunctionReference* constructor = new Napi::FunctionReference();
  *constructor = Napi::Persistent(func);
  env.SetInstanceData<Napi::FunctionReference>(constructor);

  exports.Set("CurlEasy", func);
  return exports;
}

CurlEasy::CurlEasy(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<CurlEasy>(info), headers_list_(nullptr), resolve_list_(nullptr) {
  curl_ = curl_easy_init();
  if (!curl_) {
    Napi::Error::New(info.Env(), "Failed to initialize curl easy handle").ThrowAsJavaScriptException();
    return;
  }
  SetupCallbacks();
}

CurlEasy::~CurlEasy() {
  if (headers_list_) {
    curl_slist_free_all(headers_list_);
    headers_list_ = nullptr;
  }
  if (resolve_list_) {
    curl_slist_free_all(resolve_list_);
    resolve_list_ = nullptr;
  }
  if (curl_) {
    curl_easy_cleanup(curl_);
    curl_ = nullptr;
  }
}

void CurlEasy::SetupCallbacks() {
  curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, WriteCallback);
  curl_easy_setopt(curl_, CURLOPT_WRITEDATA, this);
  curl_easy_setopt(curl_, CURLOPT_HEADERFUNCTION, HeaderCallback);
  curl_easy_setopt(curl_, CURLOPT_HEADERDATA, this);
  // Accept compressed responses
  curl_easy_setopt(curl_, CURLOPT_ACCEPT_ENCODING, "");
}

void CurlEasy::ClearBuffers() {
  response_body_.clear();
  response_headers_.clear();
}

size_t CurlEasy::WriteCallback(void* ptr, size_t size, size_t nmemb, void* userdata) {
  auto* self = static_cast<CurlEasy*>(userdata);
  size_t total = size * nmemb;
  self->response_body_.append(static_cast<char*>(ptr), total);
  return total;
}

size_t CurlEasy::HeaderCallback(void* ptr, size_t size, size_t nmemb, void* userdata) {
  auto* self = static_cast<CurlEasy*>(userdata);
  size_t total = size * nmemb;
  self->response_headers_.append(static_cast<char*>(ptr), total);
  return total;
}

Napi::Value CurlEasy::SetoptString(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected (option, value)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  int option = info[0].As<Napi::Number>().Int32Value();
  std::string value = info[1].As<Napi::String>().Utf8Value();
  CURLcode code = curl_easy_setopt(curl_, static_cast<CURLoption>(option), value.c_str());
  return Napi::Number::New(env, static_cast<int>(code));
}

Napi::Value CurlEasy::SetoptLong(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected (option, value)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  int option = info[0].As<Napi::Number>().Int32Value();
  long value = info[1].As<Napi::Number>().Int64Value();
  CURLcode code = curl_easy_setopt(curl_, static_cast<CURLoption>(option), value);
  return Napi::Number::New(env, static_cast<int>(code));
}

Napi::Value CurlEasy::SetoptSlist(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected (option, stringArray)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  int option = info[0].As<Napi::Number>().Int32Value();
  Napi::Array arr = info[1].As<Napi::Array>();

  // Free previous slist for this option type
  if (option == CURLOPT_HTTPHEADER) {
    if (headers_list_) {
      curl_slist_free_all(headers_list_);
      headers_list_ = nullptr;
    }
    for (uint32_t i = 0; i < arr.Length(); i++) {
      std::string item = arr.Get(i).As<Napi::String>().Utf8Value();
      headers_list_ = curl_slist_append(headers_list_, item.c_str());
    }
    CURLcode code = curl_easy_setopt(curl_, static_cast<CURLoption>(option), headers_list_);
    return Napi::Number::New(env, static_cast<int>(code));
  } else if (option == CURLOPT_RESOLVE) {
    if (resolve_list_) {
      curl_slist_free_all(resolve_list_);
      resolve_list_ = nullptr;
    }
    for (uint32_t i = 0; i < arr.Length(); i++) {
      std::string item = arr.Get(i).As<Napi::String>().Utf8Value();
      resolve_list_ = curl_slist_append(resolve_list_, item.c_str());
    }
    CURLcode code = curl_easy_setopt(curl_, static_cast<CURLoption>(option), resolve_list_);
    return Napi::Number::New(env, static_cast<int>(code));
  }

  // Generic slist
  struct curl_slist* slist = nullptr;
  for (uint32_t i = 0; i < arr.Length(); i++) {
    std::string item = arr.Get(i).As<Napi::String>().Utf8Value();
    slist = curl_slist_append(slist, item.c_str());
  }
  CURLcode code = curl_easy_setopt(curl_, static_cast<CURLoption>(option), slist);
  // Note: caller must manage slist lifetime for generic lists
  return Napi::Number::New(env, static_cast<int>(code));
}

Napi::Value CurlEasy::GetinfoString(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int option = info[0].As<Napi::Number>().Int32Value();
  char* value = nullptr;
  CURLcode code = curl_easy_getinfo(curl_, static_cast<CURLINFO>(option), &value);
  if (code != CURLE_OK || !value) {
    return env.Null();
  }
  return Napi::String::New(env, value);
}

Napi::Value CurlEasy::GetinfoLong(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int option = info[0].As<Napi::Number>().Int32Value();
  long value = 0;
  CURLcode code = curl_easy_getinfo(curl_, static_cast<CURLINFO>(option), &value);
  if (code != CURLE_OK) {
    return env.Null();
  }
  return Napi::Number::New(env, static_cast<double>(value));
}

Napi::Value CurlEasy::GetinfoDouble(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int option = info[0].As<Napi::Number>().Int32Value();
  double value = 0.0;
  CURLcode code = curl_easy_getinfo(curl_, static_cast<CURLINFO>(option), &value);
  if (code != CURLE_OK) {
    return env.Null();
  }
  return Napi::Number::New(env, value);
}

Napi::Value CurlEasy::Perform(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  ClearBuffers();
  CURLcode code = curl_easy_perform(curl_);
  return Napi::Number::New(env, static_cast<int>(code));
}

Napi::Value CurlEasy::Impersonate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Expected (target, defaultHeaders?)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string target = info[0].As<Napi::String>().Utf8Value();
  int default_headers = 1;
  if (info.Length() > 1 && info[1].IsBoolean()) {
    default_headers = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
  }
  CURLcode code = curl_easy_impersonate(curl_, target.c_str(), default_headers);
  return Napi::Number::New(env, static_cast<int>(code));
}

Napi::Value CurlEasy::Reset(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (headers_list_) {
    curl_slist_free_all(headers_list_);
    headers_list_ = nullptr;
  }
  if (resolve_list_) {
    curl_slist_free_all(resolve_list_);
    resolve_list_ = nullptr;
  }
  ClearBuffers();
  curl_easy_reset(curl_);
  SetupCallbacks();
  return env.Undefined();
}

Napi::Value CurlEasy::GetResponseBody(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Buffer<char>::Copy(env, response_body_.data(), response_body_.size());
}

Napi::Value CurlEasy::GetResponseHeaders(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::String::New(env, response_headers_);
}

void CurlEasy::Cleanup(const Napi::CallbackInfo& info) {
  if (headers_list_) {
    curl_slist_free_all(headers_list_);
    headers_list_ = nullptr;
  }
  if (resolve_list_) {
    curl_slist_free_all(resolve_list_);
    resolve_list_ = nullptr;
  }
  if (curl_) {
    curl_easy_cleanup(curl_);
    curl_ = nullptr;
  }
}

Napi::Value CurlEasy::Duphandle(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  // Return the raw pointer as an external — consumer must create new CurlEasy with it
  // For now, not fully implemented; return undefined
  return env.Undefined();
}

Napi::Value CurlEasy::Upkeep(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  CURLcode code = curl_easy_upkeep(curl_);
  return Napi::Number::New(env, static_cast<int>(code));
}
