import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { SaveMeta } from "../../save/schema";
import { formatDate, tickToDate } from "../../sim/Tick";

const FONT = "ui-sans-serif, system-ui, sans-serif";
export const CARD_H = 76;
const CARD_GAP = 8;
const THUMB = 64;

/** One row of the list: occupied if `meta` is present, otherwise an empty slot. */
export interface SlotRow {
  slot: number;
  meta?: SaveMeta;
}

/**
 * A vertical list of save-slot cards, shared by the main-menu load screen and
 * the in-game save/load panel. Each occupied card shows the minimap thumbnail,
 * city name, in-game date, population, funds and the real saved date/time.
 */
export class SaveSlotList {
  readonly container = new Container();

  constructor(
    private readonly width: number,
    private readonly onPick: (slot: number) => void,
  ) {
    // Let pointer events traverse down to the per-card hit targets.
    this.container.eventMode = "passive";
  }

  /** Total pixel height the list occupies for `rowCount` rows. */
  static heightFor(rowCount: number): number {
    return rowCount === 0 ? CARD_H : rowCount * CARD_H + (rowCount - 1) * CARD_GAP;
  }

  /** Re-render the list from `rows`. Empty `rows` shows a placeholder message. */
  render(rows: SlotRow[]): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    if (rows.length === 0) {
      const t = new Text({
        text: "No saved cities yet",
        style: { fill: 0x8b95a1, fontSize: 14, fontFamily: FONT },
      });
      t.anchor.set(0.5);
      t.position.set(this.width / 2, CARD_H / 2);
      t.eventMode = "none";
      this.container.addChild(t);
      return;
    }

    rows.forEach((row, i) => {
      const card = row.meta ? this.occupiedCard(row.slot, row.meta) : this.emptyCard(row.slot);
      card.y = i * (CARD_H + CARD_GAP);
      this.container.addChild(card);
    });
  }

  private occupiedCard(slot: number, meta: SaveMeta): Container {
    const card = this.cardBase(slot);

    // Minimap thumbnail (or a placeholder frame while it has none).
    const frame = new Graphics()
      .roundRect(8, (CARD_H - THUMB) / 2, THUMB, THUMB, 6)
      .fill(0x0c0f14)
      .stroke({ width: 1, color: 0x39414d });
    frame.eventMode = "none";
    card.addChild(frame);
    if (meta.thumbnail) {
      const sprite = new Sprite();
      sprite.eventMode = "none";
      sprite.width = THUMB;
      sprite.height = THUMB;
      sprite.position.set(8, (CARD_H - THUMB) / 2);
      const img = new Image();
      img.onload = () => {
        if (!sprite.destroyed) sprite.texture = Texture.from(img);
      };
      img.src = meta.thumbnail;
      card.addChild(sprite);
    }

    const textX = 8 + THUMB + 12;
    this.addText(card, meta.name || `Slot ${slot}`, textX, 14, 16, 0xeef2f6, "700");
    this.addText(card, formatDate(tickToDate(meta.simTick)), textX, 36, 12.5, 0x9aa6b2);
    this.addText(
      card,
      `Pop ${meta.population.toLocaleString()}   $${meta.funds.toLocaleString()}`,
      textX,
      54,
      12.5,
      0xb6bfca,
    );

    // Real-world saved timestamp, right-aligned.
    const stamp = new Text({
      text: new Date(meta.savedAt).toLocaleString(),
      style: { fill: 0x8b95a1, fontSize: 11, fontFamily: FONT },
    });
    stamp.anchor.set(1, 0);
    stamp.position.set(this.width - 12, 12);
    stamp.eventMode = "none";
    card.addChild(stamp);

    return card;
  }

  private emptyCard(slot: number): Container {
    const card = this.cardBase(slot);
    const t = new Text({
      text: `Empty slot ${slot} — click to save here`,
      style: { fill: 0x8b95a1, fontSize: 13, fontFamily: FONT, fontWeight: "600" },
    });
    t.anchor.set(0.5);
    t.position.set(this.width / 2, CARD_H / 2);
    t.eventMode = "none";
    card.addChild(t);
    return card;
  }

  private cardBase(slot: number): Container {
    const card = new Container();
    card.eventMode = "passive";
    const bg = new Graphics()
      .roundRect(0, 0, this.width, CARD_H, 10)
      .fill({ color: 0x222833, alpha: 0.96 })
      .stroke({ width: 1.5, color: 0x3a4250 });
    bg.eventMode = "static";
    bg.cursor = "pointer";
    bg.on("pointertap", () => this.onPick(slot));
    card.addChild(bg);
    return card;
  }

  private addText(
    parent: Container,
    text: string,
    x: number,
    y: number,
    size: number,
    color: number,
    weight = "500",
  ): void {
    const t = new Text({
      text,
      style: {
        fill: color,
        fontSize: size,
        fontFamily: FONT,
        fontWeight: weight as Text["style"]["fontWeight"],
      },
    });
    t.position.set(x, y);
    t.eventMode = "none";
    parent.addChild(t);
  }
}
