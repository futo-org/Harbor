package org.futo.polycentric.emojisprite

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

// Cells per page row, as written by tools/twemoji/generate.mjs.
private const val PAGE_COLUMNS = 16

/**
 * Draws one emoji: a cell of a sprite page shared by every view showing an
 * emoji from that page, so the picker grid decodes a handful of pages
 * instead of one image per cell.
 */
class EmojiSpriteView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var page = -1
  var cell = -1

  // What is drawn. Kept while another page decodes, so a recycled view
  // shows its previous emoji instead of flashing blank, like expo-image.
  private var drawnBitmap: Bitmap? = null
  private var drawnPage = -1
  private var drawnCell = -1

  private val sourceRect = Rect()
  private val destinationRect = Rect()
  private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

  init {
    setWillNotDraw(false)
  }

  fun loadPage() {
    val requestedPage = page
    if (drawnPage == requestedPage) {
      drawnCell = cell
      invalidate()
      return
    }
    EmojiSpritePages.load(context, requestedPage) { pageBitmap ->
      // Props may have moved on to another page while this one decoded.
      if (page != requestedPage) return@load
      drawnBitmap = pageBitmap
      drawnPage = requestedPage
      drawnCell = cell
      invalidate()
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val pageBitmap = drawnBitmap ?: return
    if (drawnCell < 0) return
    // Derived from the bitmap, so a page decoded at a reduced sample size
    // still maps correctly.
    val cellSize = pageBitmap.width / PAGE_COLUMNS
    val left = (drawnCell % PAGE_COLUMNS) * cellSize
    val top = (drawnCell / PAGE_COLUMNS) * cellSize
    sourceRect.set(left, top, left + cellSize, top + cellSize)
    val size = minOf(width, height)
    val x = (width - size) / 2
    val y = (height - size) / 2
    destinationRect.set(x, y, x + size, y + size)
    canvas.drawBitmap(pageBitmap, sourceRect, destinationRect, paint)
  }
}
