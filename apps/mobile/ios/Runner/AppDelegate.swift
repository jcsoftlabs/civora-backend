import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Les modules natifs s'enregistrent avec la fenêtre, dans SceneDelegate.
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

/// iOS 27 exige le cycle de vie par scènes (UIScene) : sans lui, l'app est arrêtée dès l'ouverture. La scène crée
/// la fenêtre Flutter, y enregistre les modules natifs et la confie à l'AppDelegate (événements des modules).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let controller = FlutterViewController(project: nil, nibName: nil, bundle: nil)
    GeneratedPluginRegistrant.register(with: controller.engine)
    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = controller
    window.makeKeyAndVisible()
    self.window = window
    (UIApplication.shared.delegate as? FlutterAppDelegate)?.window = window
    // Lien d'invitation ouvert au lancement (civora.space/rejoindre/…).
    if let url = connectionOptions.urlContexts.first?.url {
      _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: url, options: [:])
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: context.url, options: [:])
    }
  }
}
