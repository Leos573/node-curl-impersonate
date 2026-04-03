{
  "targets": [
    {
      "target_name": "curl_napi",
      "sources": [
        "src/cpp/curl_napi.cc",
        "src/cpp/curl_easy.cc",
        "src/cpp/curl_multi.cc",
        "src/cpp/curl_websocket.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "deps/include"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "CURL_STATICLIB"
      ],
      "conditions": [
        ["OS=='mac'", {
          "libraries": [
            "../deps/libcurl-impersonate.a",
            "-lc++",
            "-lz",
            "-framework Security",
            "-framework SystemConfiguration",
            "-framework CoreFoundation"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "OTHER_LDFLAGS": [
              "-Wl,-force_load,<(module_root_dir)/deps/libcurl-impersonate.a"
            ]
          }
        }],
        ["OS=='linux'", {
          "libraries": [
            "-Wl,--whole-archive",
            "../deps/libcurl-impersonate.a",
            "-Wl,--no-whole-archive",
            "-lstdc++",
            "-lz",
            "-lpthread"
          ],
          "cflags_cc": ["-std=c++17", "-fexceptions"]
        }]
      ]
    }
  ]
}
