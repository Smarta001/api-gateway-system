cmake_minimum_required(VERSION 3.16)
project(RateLimiter CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_BUILD_TYPE Release)

# ── Dependencies via FetchContent ───────────────────────────────
include(FetchContent)

# cpp-httplib — header-only HTTP server/client
FetchContent_Declare(httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.15.3
)

# nlohmann/json — header-only JSON
FetchContent_Declare(json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
)

FetchContent_MakeAvailable(httplib json)

# ── Library (core algorithms) ────────────────────────────────────
add_library(rate_limiter_lib
    src/token_bucket.cpp
    src/leaky_bucket.cpp
    src/rate_limiter_manager.cpp
)

target_include_directories(rate_limiter_lib PUBLIC include)
target_compile_options(rate_limiter_lib PRIVATE -O3 -Wall -Wextra)

# ── Server executable ────────────────────────────────────────────
add_executable(rate_limiter_server src/main.cpp)

target_link_libraries(rate_limiter_server
    PRIVATE
        rate_limiter_lib
        httplib::httplib
        nlohmann_json::nlohmann_json
        pthread
)

target_compile_options(rate_limiter_server PRIVATE -O3 -Wall -Wextra)

# ── Tests ────────────────────────────────────────────────────────
enable_testing()

add_executable(run_tests tests/test_rate_limiter.cpp)
target_link_libraries(run_tests PRIVATE rate_limiter_lib)
target_include_directories(run_tests PRIVATE include)

add_test(NAME RateLimiterTests COMMAND run_tests)
