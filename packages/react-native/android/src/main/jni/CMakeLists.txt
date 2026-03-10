cmake_minimum_required(VERSION 3.13)

# Pre-built Rust core library
add_library(rs_core STATIC IMPORTED)
set_target_properties(rs_core PROPERTIES
    IMPORTED_LOCATION "${CMAKE_CURRENT_SOURCE_DIR}/../../../libs/${ANDROID_ABI}/librs_core.a"
)

# C++ TurboModule implementation (shared with iOS via cpp/ directory)
add_library(polycentric_cxx SHARED
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/PolycentricCore.cpp"
)

target_include_directories(polycentric_cxx PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../build/generated/source/codegen/jni"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../build/generated/source/codegen/jni/react/renderer/components/PolycentricSpec"
)

target_link_libraries(polycentric_cxx
    rs_core
    jsi
    reactnative
)

# Use the same C++20 flags and options as the codegen libraries
target_compile_reactnative_options(polycentric_cxx PRIVATE)
