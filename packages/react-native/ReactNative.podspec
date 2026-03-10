require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "ReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://gitlab.futo.org/polycentric/lib-polycentric/react-native.git", :tag => "#{s.version}" }

  s.source_files = ["ios/**/*.{h,m,mm,swift}", "cpp/**/*.{h,cpp}"]
  s.private_header_files = ["ios/**/*.h", "cpp/**/*.h"]

  s.vendored_libraries = "ios/libs/**/*.a"

  s.libraries = "c++"

  install_modules_dependencies(s)
end
