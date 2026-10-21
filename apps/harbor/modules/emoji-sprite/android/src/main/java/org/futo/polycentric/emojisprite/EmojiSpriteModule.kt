package org.futo.polycentric.emojisprite

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EmojiSpriteModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EmojiSprite")

    View(EmojiSpriteView::class) {
      Prop("page") { view: EmojiSpriteView, page: Int ->
        view.page = page
      }

      Prop("cell") { view: EmojiSpriteView, cell: Int ->
        view.cell = cell
      }

      Prop("pageColumns") { view: EmojiSpriteView, pageColumns: Int ->
        view.pageColumns = pageColumns
      }

      OnViewDidUpdateProps { view: EmojiSpriteView ->
        view.loadPage()
      }
    }
  }
}
