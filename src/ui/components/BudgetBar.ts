import { Container, Graphics, Text } from "pixi.js";
import type { BudgetReport } from "../../sim/systems/BudgetSystem";

const W = 232;
const H = 58;
const MARGIN = 12;

/** Top-centre panel: current funds and last month's net budget. */
export class BudgetBar {
  readonly container = new Container();

  private readonly fundsText: Text;
  private readonly netText: Text;
  private lastFunds = NaN;

  constructor() {
    const bg = new Graphics()
      .roundRect(0, 0, W, H, 10)
      .fill({ color: 0x161a20, alpha: 0.86 })
      .stroke({ width: 1, color: 0x39414d });

    this.fundsText = new Text({
      text: "$0",
      style: {
        fill: 0xf4d77a,
        fontSize: 22,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "700",
      },
    });
    this.fundsText.anchor.set(0.5, 0);
    this.fundsText.position.set(W / 2, 7);

    this.netText = new Text({
      text: "— / mo",
      style: {
        fill: 0x9aa4af,
        fontSize: 13,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "600",
      },
    });
    this.netText.anchor.set(0.5, 0);
    this.netText.position.set(W / 2, 35);

    this.container.addChild(bg, this.fundsText, this.netText);
  }

  layout(screenW: number): void {
    this.container.x = Math.round((screenW - W) / 2);
    this.container.y = MARGIN;
  }

  /** Update the funds figure (cheap to call every frame — dedupes). */
  setFunds(funds: number): void {
    if (funds === this.lastFunds) return;
    this.lastFunds = funds;
    this.fundsText.text = `$${Math.round(funds).toLocaleString("en-US")}`;
  }

  /** Update the monthly ledger line after a month closes. */
  setReport(report: BudgetReport): void {
    this.setFunds(report.funds);
    const sign = report.net >= 0 ? "+" : "−";
    this.netText.text = `${sign}$${Math.abs(report.net).toLocaleString("en-US")} / mo`;
    this.netText.style.fill = report.net >= 0 ? 0x6cc47a : 0xd6645a;
  }
}
