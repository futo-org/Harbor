package org.futo.polycentric.emojisprite

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.LruCache
import java.util.concurrent.Executors

// Share of the app's heap the decoded pages may hold (Android's usual
// guidance for bitmap caches); a page is about 5 MB, or 1.3 MB at half size.
private const val CACHE_HEAP_FRACTION = 8

/** Decodes sprite pages off the main thread and keeps recently used ones. */
internal object EmojiSpritePages {
  private const val TAG = "EmojiSpritePages"

  private val cache = object : LruCache<Int, Bitmap>(
    (Runtime.getRuntime().maxMemory() / CACHE_HEAP_FRACTION).toInt()
  ) {
    override fun sizeOf(key: Int, value: Bitmap) = value.byteCount
  }
  // Listeners by page for decodes in flight; touched only on the main thread.
  private val pendingListenersByPage = HashMap<Int, MutableList<(Bitmap?) -> Unit>>()
  private val decoder = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  private var isTrimCallbackRegistered = false

  /**
   * Calls [onLoaded] on the main thread, right away if the page is cached,
   * with null if the page fails to decode.
   */
  fun load(context: Context, page: Int, onLoaded: (Bitmap?) -> Unit) {
    if (page < 0) return
    registerTrimCallback(context)
    cache.get(page)?.let {
      onLoaded(it)
      return
    }
    pendingListenersByPage[page]?.let {
      it.add(onLoaded)
      return
    }
    pendingListenersByPage[page] = mutableListOf(onLoaded)

    val appContext = context.applicationContext
    decoder.execute {
      val bitmap = decodePage(appContext, page)
      mainHandler.post {
        val listeners = pendingListenersByPage.remove(page).orEmpty()
        if (bitmap != null) cache.put(page, bitmap)
        listeners.forEach { it(bitmap) }
      }
    }
  }

  // Views still hold the pages they draw; this drops the rest once the app
  // is backgrounded or the system runs low.
  private fun registerTrimCallback(context: Context) {
    if (isTrimCallbackRegistered) return
    isTrimCallbackRegistered = true
    context.applicationContext.registerComponentCallbacks(object : ComponentCallbacks2 {
      override fun onTrimMemory(level: Int) {
        if (level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) cache.evictAll()
      }

      override fun onConfigurationChanged(newConfig: Configuration) = Unit

      @Deprecated("Deprecated in Java")
      override fun onLowMemory() = cache.evictAll()
    })
  }

  private fun decodePage(context: Context, page: Int): Bitmap? {
    val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val options = BitmapFactory.Options().apply {
      // Half-size pages on low-RAM devices, as Signal does.
      inSampleSize = if (activityManager.isLowRamDevice) 2 else 1
    }
    return try {
      context.assets.open("emoji-sprite/page-$page.png").use {
        BitmapFactory.decodeStream(it, null, options)
      }
    } catch (e: Throwable) {
      // Includes OutOfMemoryError on low-heap devices: an escaped throwable
      // would crash the app and leave the page's listeners pending forever.
      Log.w(TAG, "Failed to decode emoji sprite page $page", e)
      null
    }
  }
}
