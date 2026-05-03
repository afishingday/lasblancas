import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const OUTPUT_MAX_EDGE = 1280
const MIN_FRAC = 0.04
const HANDLE_PX = 14

function loadImageFromObjectUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode'))
    img.src = url
  })
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function clampNorm(n) {
  let { nx, ny, nw, nh } = n
  nw = clamp(nw, MIN_FRAC, 1)
  nh = clamp(nh, MIN_FRAC, 1)
  nx = clamp(nx, 0, 1 - nw)
  ny = clamp(ny, 0, 1 - nh)
  return { nx, ny, nw, nh }
}

function maxCenteredNormCrop(iw, ih, aspectWOverH) {
  if (!iw || !ih || !Number.isFinite(aspectWOverH) || aspectWOverH <= 0) {
    return { nx: 0, ny: 0, nw: 1, nh: 1 }
  }
  const arImage = iw / ih
  const nwOverNh = aspectWOverH / arImage
  let nh = 1
  let nw = nwOverNh * nh
  if (nw > 1) {
    nw = 1
    nh = nw / nwOverNh
  }
  nh = clamp(nh, MIN_FRAC, 1)
  nw = clamp(nwOverNh * nh, MIN_FRAC, 1)
  if (nw > 1 - 1e-6) {
    nw = 1
    nh = clamp(nw / nwOverNh, MIN_FRAC, 1)
  }
  const nx = (1 - nw) / 2
  const ny = (1 - nh) / 2
  return clampNorm({ nx, ny, nw, nh })
}

function outputCanvasSize(ar) {
  if (!Number.isFinite(ar) || ar <= 0) {
    return { outW: OUTPUT_MAX_EDGE, outH: Math.round(OUTPUT_MAX_EDGE / (16 / 9)) }
  }
  if (ar >= 1) {
    return { outW: OUTPUT_MAX_EDGE, outH: Math.max(1, Math.round(OUTPUT_MAX_EDGE / ar)) }
  }
  return { outH: OUTPUT_MAX_EDGE, outW: Math.max(1, Math.round(OUTPUT_MAX_EDGE * ar)) }
}

function clientToNorm(clientX, clientY, containerRect, layout) {
  const { ox, oy, dw, dh } = layout
  const x = clientX - containerRect.left - ox
  const y = clientY - containerRect.top - oy
  return {
    nx: clamp(x / dw, 0, 1),
    ny: clamp(y / dh, 0, 1),
  }
}

function applyHandleDrag(handle, p, a, min) {
  const right = a.nx + a.nw
  const bottom = a.ny + a.nh

  if (handle === 'move') return null
  if (handle === 'nw') {
    const newL = clamp(p.nx, 0, right - min)
    const newT = clamp(p.ny, 0, bottom - min)
    return clampNorm({ nx: newL, ny: newT, nw: right - newL, nh: bottom - newT })
  }
  if (handle === 'n') {
    const newT = clamp(p.ny, 0, bottom - min)
    return clampNorm({ nx: a.nx, ny: newT, nw: a.nw, nh: bottom - newT })
  }
  if (handle === 'ne') {
    const newT = clamp(p.ny, 0, bottom - min)
    const newR = clamp(p.nx, a.nx + min, 1)
    return clampNorm({ nx: a.nx, ny: newT, nw: newR - a.nx, nh: bottom - newT })
  }
  if (handle === 'e') {
    const newR = clamp(p.nx, a.nx + min, 1)
    return clampNorm({ nx: a.nx, ny: a.ny, nw: newR - a.nx, nh: a.nh })
  }
  if (handle === 'se') {
    const newR = clamp(p.nx, a.nx + min, 1)
    const newB = clamp(p.ny, a.ny + min, 1)
    return clampNorm({ nx: a.nx, ny: a.ny, nw: newR - a.nx, nh: newB - a.ny })
  }
  if (handle === 's') {
    const newB = clamp(p.ny, a.ny + min, 1)
    return clampNorm({ nx: a.nx, ny: a.ny, nw: a.nw, nh: newB - a.ny })
  }
  if (handle === 'sw') {
    const newL = clamp(p.nx, 0, right - min)
    const newB = clamp(p.ny, a.ny + min, 1)
    return clampNorm({ nx: newL, ny: a.ny, nw: right - newL, nh: newB - a.ny })
  }
  if (handle === 'w') {
    const newL = clamp(p.nx, 0, right - min)
    return clampNorm({ nx: newL, ny: a.ny, nw: right - newL, nh: a.nh })
  }
  return a
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {File | null} props.file
 * @param {string} [props.title]
 * @param {string} [props.subtitle]
 * @param {() => void} props.onCancel
 * @param {(cropped: File) => void} props.onConfirm
 */
export function ImageCropDialog({
  open,
  file,
  title = 'Recorta la foto',
  subtitle = 'Arrastra las esquinas o los bordes del marco blanco para ajustar el recorte. Dentro del marco puedes arrastrar para mover. Los botones "Encajar" centran un marco con proporción fija.',
  onCancel,
  onConfirm,
}) {
  const containerRef = useRef(null)
  const layoutRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [iw, setIw] = useState(0)
  const [ih, setIh] = useState(0)
  const [cw, setCw] = useState(360)
  const [ch, setCh] = useState(280)

  const [norm, setNorm] = useState(() => ({ nx: 0, ny: 0, nw: 1, nh: 1 }))
  const normRef = useRef(norm)
  normRef.current = norm
  const dragSessionRef = useRef(null)

  const layout = useMemo(() => {
    if (!iw || !ih || cw <= 0 || ch <= 0) return null
    const s = Math.min(cw / iw, ch / ih)
    const dw = iw * s
    const dh = ih * s
    const ox = (cw - dw) / 2
    const oy = (ch - dh) / 2
    const L = { s, dw, dh, ox, oy, iw, ih }
    layoutRef.current = L
    return L
  }, [iw, ih, cw, ch])

  const screenCrop = useMemo(() => {
    if (!layout) return null
    const { ox, oy, dw, dh } = layout
    const { nx, ny, nw, nh } = norm
    return {
      left: ox + nx * dw,
      top: oy + ny * dh,
      width: nw * dw,
      height: nh * dh,
    }
  }, [layout, norm])

  useEffect(() => {
    if (!open) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setIw(0)
      setIh(0)
      setNorm({ nx: 0, ny: 0, nw: 1, nh: 1 })
      dragSessionRef.current = null
      return undefined
    }
    if (!file) return undefined
    const u = URL.createObjectURL(file)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return u
    })
    return () => {
      URL.revokeObjectURL(u)
    }
  }, [open, file])

  useEffect(() => {
    if (!open) return
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0) setCw(Math.floor(r.width))
      if (r.height > 0) setCh(Math.floor(r.height))
    })
    ro.observe(el)
    const r0 = el.getBoundingClientRect()
    if (r0.width > 0) setCw(Math.floor(r0.width))
    if (r0.height > 0) setCh(Math.floor(r0.height))
    return () => ro.disconnect()
  }, [open])

  const handleImgLoad = useCallback((e) => {
    const el = e.currentTarget
    setIw(el.naturalWidth || el.width)
    setIh(el.naturalHeight || el.height)
  }, [])

  const applySnap = useCallback(
    (aspectWOverH) => {
      if (!iw || !ih) return
      setNorm(maxCenteredNormCrop(iw, ih, aspectWOverH))
    },
    [iw, ih],
  )

  const resetFull = useCallback(() => {
    setNorm({ nx: 0, ny: 0, nw: 1, nh: 1 })
  }, [])

  const onPointerDownHandle = useCallback((e, handle) => {
    if (!layoutRef.current || !containerRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const rect = containerRef.current.getBoundingClientRect()
    const layout = layoutRef.current
    const startPointerNorm = clientToNorm(e.clientX, e.clientY, rect, layout)
    const startNorm = { ...normRef.current }
    dragSessionRef.current = { handle, startNorm, startPointerNorm }

    const onMove = (ev) => {
      const sess = dragSessionRef.current
      const L = layoutRef.current
      const r = containerRef.current?.getBoundingClientRect()
      if (!sess || !L || !r) return
      const p = clientToNorm(ev.clientX, ev.clientY, r, L)
      const min = MIN_FRAC
      const a = sess.startNorm

      if (sess.handle === 'move') {
        const sp = sess.startPointerNorm
        const dnx = p.nx - sp.nx
        const dny = p.ny - sp.ny
        setNorm(
          clampNorm({
            nx: clamp(a.nx + dnx, 0, 1 - a.nw),
            ny: clamp(a.ny + dny, 0, 1 - a.nh),
            nw: a.nw,
            nh: a.nh,
          }),
        )
        return
      }

      const next = applyHandleDrag(sess.handle, p, a, min)
      if (next) setNorm(next)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      dragSessionRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!file || !iw || !ih) return
    const { nx, ny, nw, nh } = norm
    const sx = nx * iw
    const sy = ny * ih
    const sw = nw * iw
    const sh = nh * ih
    if (sw < 2 || sh < 2) return

    const url = URL.createObjectURL(file)
    let img
    try {
      img = await loadImageFromObjectUrl(url)
    } finally {
      URL.revokeObjectURL(url)
    }

    const cropAspect = sw / sh
    const { outW, outH } = outputCanvasSize(cropAspect)
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, outW, outH)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
    })
    if (!blob) return
    const base = (file.name.replace(/\.[^.]+$/, '') || 'foto').replace(/[^\w\-]/g, '_').slice(0, 72)
    const cropped = new File([blob], `${base || 'foto'}_recorte.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
    onConfirm(cropped)
  }, [file, iw, ih, norm, onConfirm])

  if (!open || !file) return null

  const handleBase = 'absolute z-30 bg-white border-2 border-emerald-500 shadow-sm touch-none'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/70 backdrop-blur-sm p-4">
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto border border-stone-200 overflow-x-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
      >
        <div className="p-5 border-b border-stone-100">
          <h3 id="image-crop-title" className="text-lg font-black text-stone-900">
            {title}
          </h3>
          <p className="text-xs text-stone-600 mt-1">{subtitle}</p>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1.5">
              Atajos de marco
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={resetFull}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
              >
                Foto completa
              </button>
              <button
                type="button"
                disabled={!iw || !ih}
                onClick={() => applySnap(16 / 9)}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Encajar 16:9
              </button>
              <button
                type="button"
                disabled={!iw || !ih}
                onClick={() => applySnap(9 / 16)}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Encajar 9:16
              </button>
              <button
                type="button"
                disabled={!iw || !ih}
                onClick={() => applySnap(1)}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Encajar 1:1
              </button>
              <button
                type="button"
                disabled={!iw || !ih}
                onClick={() => applySnap(4 / 3)}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Encajar 4:3
              </button>
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative w-full rounded-2xl bg-zinc-900 overflow-hidden select-none touch-none"
            style={{ height: 'min(52vh, 420px)', minHeight: 220 }}
          >
            {previewUrl && (
              <img
                key={previewUrl}
                src={previewUrl}
                alt=""
                draggable={false}
                onLoad={handleImgLoad}
                className="absolute pointer-events-none max-w-none max-h-none"
                style={
                  layout
                    ? {
                        width: layout.dw,
                        height: layout.dh,
                        left: layout.ox,
                        top: layout.oy,
                      }
                    : { left: '50%', top: '50%', width: 1, height: 1, opacity: 0 }
                }
              />
            )}

            {layout && screenCrop && (
              <>
                <div className="absolute inset-0 z-[5] pointer-events-none">
                  <div
                    className="absolute left-0 right-0 top-0 bg-zinc-950/60"
                    style={{ height: screenCrop.top }}
                  />
                  <div
                    className="absolute left-0 right-0 bg-zinc-950/60"
                    style={{ top: screenCrop.top + screenCrop.height, bottom: 0 }}
                  />
                  <div
                    className="absolute left-0 bg-zinc-950/60"
                    style={{
                      top: screenCrop.top,
                      width: screenCrop.left,
                      height: screenCrop.height,
                    }}
                  />
                  <div
                    className="absolute bg-zinc-950/60"
                    style={{
                      top: screenCrop.top,
                      left: screenCrop.left + screenCrop.width,
                      height: screenCrop.height,
                      width: Math.max(0, cw - screenCrop.left - screenCrop.width),
                    }}
                  />
                </div>

                <div
                  role="presentation"
                  className="absolute z-10 border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] cursor-move"
                  style={{
                    left: screenCrop.left,
                    top: screenCrop.top,
                    width: screenCrop.width,
                    height: screenCrop.height,
                  }}
                  onPointerDown={(e) => onPointerDownHandle(e, 'move')}
                />

                {[
                  ['nw', -HANDLE_PX / 2, -HANDLE_PX / 2, 'nwse-resize'],
                  ['ne', screenCrop.width - HANDLE_PX / 2, -HANDLE_PX / 2, 'nesw-resize'],
                  ['sw', -HANDLE_PX / 2, screenCrop.height - HANDLE_PX / 2, 'nesw-resize'],
                  ['se', screenCrop.width - HANDLE_PX / 2, screenCrop.height - HANDLE_PX / 2, 'nwse-resize'],
                ].map(([id, dx, dy, cur]) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Redimensionar esquina ${id}`}
                    className={`${handleBase} rounded-sm`}
                    style={{
                      width: HANDLE_PX,
                      height: HANDLE_PX,
                      left: screenCrop.left + Number(dx),
                      top: screenCrop.top + Number(dy),
                      cursor: cur,
                    }}
                    onPointerDown={(e) => onPointerDownHandle(e, id)}
                  />
                ))}

                {[
                  ['n', screenCrop.width / 2 - HANDLE_PX / 2, -HANDLE_PX / 2, HANDLE_PX, 6, 'ns-resize'],
                  ['s', screenCrop.width / 2 - HANDLE_PX / 2, screenCrop.height - 3, HANDLE_PX, 6, 'ns-resize'],
                  ['w', -3, screenCrop.height / 2 - HANDLE_PX / 2, 6, HANDLE_PX, 'ew-resize'],
                  ['e', screenCrop.width - 3, screenCrop.height / 2 - HANDLE_PX / 2, 6, HANDLE_PX, 'ew-resize'],
                ].map(([id, dx, dy, w, h, cur]) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Redimensionar borde ${id}`}
                    className={`${handleBase} rounded-full`}
                    style={{
                      width: Number(w),
                      height: Number(h),
                      left: screenCrop.left + Number(dx),
                      top: screenCrop.top + Number(dy),
                      cursor: cur,
                    }}
                    onPointerDown={(e) => onPointerDownHandle(e, id)}
                  />
                ))}
              </>
            )}

            {previewUrl && !layout && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold z-40">
                Cargando…
              </div>
            )}
          </div>

          <p className="text-[11px] text-stone-500 px-0.5 leading-snug">
            El área clara es lo que se guarda. La imagen final se optimiza (máx. {OUTPUT_MAX_EDGE}px en el lado
            largo).
          </p>
        </div>

        <div className="flex gap-3 p-4 border-t border-stone-100 bg-stone-50">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold bg-stone-200 text-stone-800 hover:bg-stone-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!layout}
            onClick={() => void handleConfirm()}
            className="flex-1 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            Usar este recorte
          </button>
        </div>
      </div>
    </div>
  )
}
