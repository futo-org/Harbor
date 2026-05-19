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

  s.source_files = ["ios/**/*.{h,m,mm,swift}", "cpp/**/*.{h,hpp,c,cpp}"]
  s.private_header_files = ["ios/**/*.h", "cpp/**/*.{h,hpp}"]

  s.vendored_frameworks = "PolycentricReactNativeFramework.xcframework"

  s.libraries = "c++"

  s.dependency "uniffi-bindgen-react-native"

  install_modules_dependencies(s)
end
