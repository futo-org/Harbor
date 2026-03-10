#import "PolycentricCoreProvider.h"
#import "../cpp/PolycentricCore.h"

@implementation PolycentricCoreProvider

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::PolycentricCore>(params.jsInvoker);
}

@end
