/**
 * A stylized, static preview of the product's signature surfaces (financial-trust card
 * + risk radar), built from the app's own design tokens. Not a live screenshot — a
 * faithful mock so the landing shows what the terminal looks like.
 */
const PILLARS = [
  { label: "Chất lượng lợi nhuận", value: "Thấp", tone: "bg-error", text: "text-error" },
  { label: "Rủi ro thao túng", value: "Cao", tone: "bg-error", text: "text-error" },
  { label: "Sức khỏe tài chính", value: "Cảnh báo", tone: "bg-amber-400", text: "text-amber-400" },
  { label: "Định giá vs ngành", value: "Đắt ~28%", tone: "bg-amber-400", text: "text-amber-400" },
];

const RADAR = [
  { sym: "HAG", profile: "Rủi ro", tone: "text-error", qoe: 18, news: "Đăng ký thoái vốn" },
  { sym: "FLC", profile: "Rủi ro", tone: "text-error", qoe: 24, news: "Thanh tra thuế" },
  { sym: "ITA", profile: "Theo dõi", tone: "text-amber-400", qoe: 41, news: "Chậm công bố BCTC" },
];

export default function ProductPreview() {
  return (
    <div className="relative">
      {/* Financial-trust card */}
      <div className="border border-error/40 bg-surface-container-low p-4 shadow-2xl shadow-black/40">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
            Hồ sơ tin cậy · HAG
          </span>
          <span className="font-label-caps text-label-caps uppercase text-error">Rủi ro cần lưu ý</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {PILLARS.map((p) => (
            <div key={p.label} className="flex items-start gap-2">
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${p.tone}`} />
              <div>
                <div className="font-label-caps text-label-caps text-on-surface-variant uppercase leading-tight">
                  {p.label}
                </div>
                <div className={`text-data-sm ${p.text}`}>{p.value}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-outline-variant pt-2">
          <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Tín hiệu đồng thuận
          </div>
          <p className="text-data-sm text-on-surface mt-0.5">
            Chất lượng lợi nhuận yếu trùng rủi ro thao túng cao — hai tín hiệu cùng chiều.
          </p>
        </div>
      </div>

      {/* Radar snippet — overlapping, offset for depth */}
      <div className="mt-[-1rem] ml-6 md:ml-10 border border-outline-variant bg-surface-container shadow-2xl shadow-black/50">
        <div className="px-3 py-2 border-b border-outline-variant font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
          Radar tín hiệu
        </div>
        <table className="w-full border-collapse font-data-md text-data-sm">
          <tbody>
            {RADAR.map((r) => (
              <tr key={r.sym} className="border-b border-outline-variant/40 last:border-0">
                <td className="py-1.5 pl-3 pr-2 font-bold text-primary">{r.sym}</td>
                <td className={`py-1.5 px-2 font-bold ${r.tone}`}>{r.profile}</td>
                <td className={`py-1.5 px-2 text-right tabular-nums ${r.qoe < 45 ? "text-error" : "text-amber-400"}`}>
                  {r.qoe}
                </td>
                <td className="py-1.5 pl-2 pr-3 text-on-surface-variant truncate">{r.news}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Floating QoE chip */}
      <div className="absolute -top-4 -right-3 md:-right-5 border border-secondary/50 bg-background px-3 py-1.5 shadow-xl shadow-black/40">
        <div className="font-label-caps text-label-caps uppercase text-on-surface-variant">Chất lượng LN</div>
        <div className="font-display-lg text-headline-md text-secondary leading-none">82<span className="text-data-sm text-on-surface-variant">/100</span></div>
      </div>
    </div>
  );
}
