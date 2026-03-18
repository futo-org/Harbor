module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        cxxModuleCMakeListsModuleName: 'polycentric_cxx',
        cxxModuleCMakeListsPath: 'src/main/jni/CMakeLists.txt',
        cxxModuleHeaderName: 'PolycentricCore',
      },
    },
  },
};
