"""
Procedural cover art for the Welcome screen: an ancient stone gateway hall seen from its entrance, with warm golden light
pouring through a distant arch. Pure numpy + Pillow: every pixel is computed (ray-cast corridor, stone courses, light falloff,
volumetric rays, dust, bloom, grain). No stock images, no network. Output: portrait 1080 x 1920.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

W, H = 1080, 1920
CX, CY, F = 540.0, 585.0, 880.0  # vanishing point (the arch) and focal length in pixels
A = 1.6        # half width of the hall
FLOOR = 1.1    # floor is 1.1 below the eye
CEIL = -2.7    # ceiling is 2.7 above the eye
ZEND = 7.4     # the far wall with the arch
AW = 1.12      # arch half width
SPRING = -0.85  # where the arch curve begins
OUT = sys.argv[1] if len(sys.argv) > 1 else 'cover.jpg'
rng = np.random.default_rng(7)


def fbm(h, w, base, octaves, seed):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        cell = max(2.0, base / (2 ** o))
        gh, gw = int(h / cell) + 3, int(w / cell) + 3
        g = r.random((gh, gw)).astype(np.float32)
        im = Image.fromarray(g, mode='F').resize((w, h), Image.BICUBIC)
        out += amp * np.asarray(im, np.float32)
        tot += amp
        amp *= 0.5
    return out / tot


def hash2(a, b, seed=0.0):
    x = np.sin(a * 12.9898 + b * 78.233 + seed * 37.719) * 43758.5453
    return (x - np.floor(x)).astype(np.float32)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ geometry: one ray per pixel
xs = ((np.arange(W, dtype=np.float32) - CX) / F)[None, :]
ys = ((np.arange(H, dtype=np.float32) - CY) / F)[:, None]
dx = np.broadcast_to(xs, (H, W)).astype(np.float32)
dy = np.broadcast_to(ys, (H, W)).astype(np.float32)
INF = np.float32(1e9)
t_floor = np.where(dy > 1e-6, FLOOR / np.maximum(dy, 1e-6), INF)
t_ceil = np.where(dy < -1e-6, CEIL / np.minimum(dy, -1e-6), INF)
t_wall = np.where(np.abs(dx) > 1e-6, A / np.maximum(np.abs(dx), 1e-6), INF)
t_end = np.full((H, W), ZEND, np.float32)
T = np.minimum(np.minimum(t_floor, t_ceil), np.minimum(t_wall, t_end))
is_floor = T == t_floor
is_ceil = (T == t_ceil) & ~is_floor
is_wall = (T == t_wall) & ~is_floor & ~is_ceil
is_end = ~(is_floor | is_ceil | is_wall)
X, Y, Z = dx * T, dy * T, T
side = np.sign(dx)

# a shared fine stone texture
tex = fbm(1024, 1024, 64, 5, 11)
tex2 = fbm(1024, 1024, 20, 4, 12)


def stone(u, v, scale=130.0):
    iu = (np.abs(u) * scale).astype(np.int64) % 1024
    iv = (np.abs(v + 5.0) * scale).astype(np.int64) % 1024
    return 0.62 + 0.55 * tex[iv, iu] + 0.25 * (tex2[iv, iu] - 0.5)


img = np.zeros((H, W, 3), np.float32)
SAND = np.array([1.0, 0.74, 0.46], np.float32)

# ------------------------------------------------------------------ side walls: courses of stone, buttresses, a cornice
rowf = (Y + 3.2) / 0.56
row = np.floor(rowf)
fy = rowf - row
uf = Z / 1.3 + (row % 2) * 0.5
col = np.floor(uf)
fx = uf - col
blockvar = 0.72 + 0.5 * hash2(row, col, 1.0 + side)
mortar = ((fy < 0.05) | (fx < 0.022)).astype(np.float32)
pits = smooth(0.64, 0.9, fbm(H, W, 24, 4, 51)) * 0.3 + smooth(0.55, 0.85, fbm(H, W, 110, 3, 52)) * 0.16
wall = stone(Z, Y) * blockvar * (1 - 0.5 * mortar) * (1 - pits)
# the face of each course catches a little light on its top edge
wall *= 1 + 0.35 * smooth(0.82, 1.0, fy) * (1 - mortar)
# buttresses: lit faces and the shadow beside them, as seen along the hall
pz = np.mod(Z, 1.9)
buttress = np.where(pz < 0.36, 1.32, np.where(pz < 0.66, 0.5, 1.0)).astype(np.float32)
buttress *= 1 - 0.7 * ((pz < 0.04) | ((pz > 0.36) & (pz < 0.4))).astype(np.float32)
wall *= buttress
# cornice ledge near the top
ledge = ((Y < -1.88) & (Y > -2.12)).astype(np.float32)
wall *= 1 + 0.4 * ledge
wall *= np.where(Y < -2.12, 0.55, 1.0)
# a frieze of gold rosettes on dark bronze, the way an ancient gateway is dressed
band = (Y > -1.62) & (Y < -1.18)
fz = np.mod(Z, 0.62) / 0.62 - 0.5
fyv = (Y + 1.40) / 0.44
rho = np.sqrt(fz ** 2 + fyv ** 2)
ang = np.arctan2(fyv, fz)
rose = (1 - smooth(0.2, 0.3, rho)) * (0.65 + 0.35 * np.cos(8 * ang)) + (1 - smooth(0.06, 0.1, rho)) * 0.6
edges = ((np.abs(fyv) > 0.46) & (np.abs(fyv) < 0.5)).astype(np.float32)
frieze = (0.42 + 0.35 * tex[(np.abs(Y + 5) * 130).astype(np.int64) % 1024, (np.abs(Z) * 130).astype(np.int64) % 1024])[:, :, None] * np.array([1.0, 0.7, 0.4], np.float32)[None, None, :]
frieze = frieze * 0.8 + (np.clip(rose, 0, 1) * 1.1 + edges * 0.5)[:, :, None] * np.array([1.0, 0.82, 0.42], np.float32)[None, None, :]
lz = np.exp(-(ZEND - Z) / 3.3)
hf = np.exp(-(((Y + 0.5) / 1.9) ** 2) * 0.55)
wall_light = 0.035 + 1.55 * lz * hf
wall_rgb = wall[:, :, None] * SAND[None, None, :]
wall_rgb = np.where(band[:, :, None], frieze, wall_rgb)
img[is_wall] = (wall_rgb * wall_light[:, :, None])[is_wall]

# ------------------------------------------------------------------ floor: worn slabs with a bright path of reflected light
sl_row = np.floor(Z / 0.95)
fu = X / 0.8 + (sl_row % 2) * 0.5
fcol = np.floor(fu)
ffx = fu - fcol
ffz = Z / 0.95 - sl_row
fmort = ((ffx < 0.018) | (ffz < 0.022)).astype(np.float32)
slab = stone(X, Z * 1.3, 110.0) * (0.72 + 0.5 * hash2(sl_row, fcol, 4.0)) * (1 - 0.5 * fmort) * (1 - 0.28 * smooth(0.6, 0.88, fbm(H, W, 40, 4, 53)))
streak = 0.65 + 0.7 * fbm(H, W, 90, 3, 21)
refl = np.exp(-((X / 0.6) ** 2)) * np.exp(-(ZEND - Z) / 6.5) * 1.5 * streak
floor_light = 0.025 + 0.6 * np.exp(-(ZEND - Z) / 3.8) + refl
img[is_floor] = (slab[:, :, None] * SAND[None, None, :] * floor_light[:, :, None])[is_floor]

# ------------------------------------------------------------------ ceiling: dark stone with heavy cross beams
bz = np.mod(Z, 1.35)
beam = np.where(bz < 0.24, 0.35, np.where(bz < 0.3, 1.5, 1.0)).astype(np.float32)
ceil_c = stone(X, Z, 100.0) * beam
ceil_light = 0.02 + 0.55 * np.exp(-(ZEND - Z) / 2.4)
img[is_ceil] = (ceil_c[:, :, None] * np.array([0.9, 0.66, 0.42], np.float32)[None, None, :] * ceil_light[:, :, None])[is_ceil]

# ------------------------------------------------------------------ far wall and the glowing arch
ax = np.abs(X)
inside = np.where(Y >= SPRING, ax < AW, ax ** 2 + (Y - SPRING) ** 2 < AW ** 2)
inside &= is_end
# distance to the opening's edge (positive outside), for a lit rim and light spilling onto the stone
d_out = np.where(Y >= SPRING, ax - AW, np.sqrt(ax ** 2 + (Y - SPRING) ** 2) - AW)
d_out = np.where(Y > FLOOR, 9.0, d_out)
frow = np.floor((Y + 3.2) / 0.43)
fcolu = np.floor(X / 0.95 + (frow % 2) * 0.5)
endstone = stone(X, Y) * (0.72 + 0.5 * hash2(frow, fcolu, 7.0))
fmortar = (((Y + 3.2) / 0.43 - frow < 0.07) | ((X / 0.95 + (frow % 2) * 0.5) - fcolu < 0.035)).astype(np.float32)
endstone *= 1 - 0.6 * fmortar
spill = np.exp(-np.maximum(d_out, 0) / 0.85)
end_light = 0.05 + 1.35 * spill
end_col = endstone[:, :, None] * SAND[None, None, :] * end_light[:, :, None]
rim = np.exp(-np.maximum(d_out, 0) / 0.05)[:, :, None] * np.array([1.0, 0.82, 0.5], np.float32)[None, None, :] * 1.2
end_col = end_col + rim * (d_out > 0)[:, :, None]
img[is_end] = end_col[is_end]

# the light itself: bright gold at the heart, amber toward the edge, with a smaller, dimmer gateway further off
rr = np.sqrt((X / AW) ** 2 + ((Y + 0.15) / 1.7) ** 2)
mix = np.clip(rr, 0, 1) ** 1.2
bright = np.array([1.0, 0.96, 0.82], np.float32)
amber = np.array([1.0, 0.70, 0.32], np.float32)
glow_col = (bright[None, None, :] * (1 - mix[:, :, None]) + amber[None, None, :] * mix[:, :, None]) * 1.3
ax2 = np.abs(X)
inner = np.where(Y >= -0.28, ax2 < 0.5, ax2 ** 2 + (Y + 0.28) ** 2 < 0.5 ** 2) & (Y < 0.7) & inside
inner_edge = np.where(Y >= -0.28, 0.5 - ax2, 0.5 - np.sqrt(ax2 ** 2 + (Y + 0.28) ** 2))
inner_col = np.array([0.95, 0.6, 0.24], np.float32)[None, None, :] * (0.8 + 1.0 * np.clip(1 - np.abs(X) / 0.5, 0, 1) * np.clip((0.7 - Y) / 1.0, 0, 1))[:, :, None]
inner_col = inner_col * np.clip(inner_edge / 0.06, 0.18, 1.0)[:, :, None]
glow_col = np.where(inner[:, :, None], inner_col, glow_col)
img[inside] = glow_col[inside]
opening = inside.astype(np.float32)

# a faint warm haze, thicker toward the light
haze_n = fbm(H, W, 220, 4, 31)
r_arch = np.sqrt(((np.arange(W)[None, :] - CX) / 520.0) ** 2 + ((np.arange(H)[:, None] - (CY - 40)) / 640.0) ** 2)
haze = np.exp(-r_arch ** 1.4 * 1.5)
img += (0.07 * haze * (0.6 + 0.8 * haze_n))[:, :, None] * np.array([1.0, 0.72, 0.38], np.float32)[None, None, :]

# ------------------------------------------------------------------ volumetric rays streaming out of the arch
mask = np.asarray(Image.fromarray(opening * 1.0, mode='F').filter(ImageFilter.GaussianBlur(5)), np.float32) if False else opening
m_im = Image.fromarray(opening.astype(np.float32), mode='F')
steps, grow = 34, 0.05
acc = np.zeros((H, W), np.float32)
wsum = 0.0
ARCH_Y = CY + (SPRING - 0.4) / ZEND * F * 0.0 + (-0.35 / ZEND) * F  # screen height of the arch's centre
for i in range(steps):
    s = 1 + i * grow
    a = 1.0 / s
    c = CX - CX / s
    f_ = ARCH_Y - ARCH_Y / s
    t_im = m_im.transform(m_im.size, Image.AFFINE, (a, 0, c, 0, a, f_), resample=Image.BILINEAR)
    wgt = (1 - i / steps) ** 1.7
    acc += np.asarray(t_im, np.float32) * wgt
    wsum += wgt
rays = acc / wsum
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
theta = np.arctan2(yy - ARCH_Y, xx - CX)
mod = np.zeros_like(theta)
for k in range(5, 46):
    mod += rng.random() * np.sin(k * theta + rng.random() * 6.283) / (k ** 0.45)
mod = (mod - mod.min()) / (mod.max() - mod.min())
mod = np.clip(0.18 + 1.25 * mod ** 1.6, 0, 1.4)
dust_n = 0.55 + 0.9 * fbm(H, W, 160, 4, 41)
radial = np.exp(-np.sqrt(((xx - CX) / 1500.0) ** 2 + ((yy - ARCH_Y) / 2100.0) ** 2) * 1.15)
rays = rays * mod * dust_n * radial
rays = np.clip(rays, 0, None)
img += (rays * 2.3)[:, :, None] * np.array([1.0, 0.78, 0.4], np.float32)[None, None, :]

# ------------------------------------------------------------------ dust floating in the light
dust = Image.new('RGB', (W, H), (0, 0, 0))
dd = ImageDraw.Draw(dust)
prob = np.clip(rays / (rays.max() + 1e-6), 0, 1) ** 0.7
placed = 0
while placed < 640:
    px, py = int(rng.integers(0, W)), int(rng.integers(0, int(H * 0.82)))
    if rng.random() < 0.08 + 0.92 * prob[py, px]:
        r = float(rng.choice([1.0, 1.4, 1.9, 2.6, 3.4], p=[0.34, 0.28, 0.2, 0.13, 0.05]))
        b = int(70 + 170 * rng.random() * (0.4 + prob[py, px]))
        dd.ellipse((px - r, py - r, px + r, py + r), fill=(b, int(b * 0.8), int(b * 0.5)))
        placed += 1
dust = dust.filter(ImageFilter.GaussianBlur(1.1))
img += np.asarray(dust, np.float32) / 255.0 * 0.85

# ------------------------------------------------------------------ bloom
lum = img.max(axis=2)
hi = np.clip(img - 1.0, 0, None)
hi8 = Image.fromarray(np.clip(hi * 160, 0, 255).astype(np.uint8))
b1 = np.asarray(hi8.filter(ImageFilter.GaussianBlur(26)), np.float32) / 160.0
b2 = np.asarray(hi8.filter(ImageFilter.GaussianBlur(90)), np.float32) / 160.0
img += 0.5 * b1 + 0.7 * b2

# ------------------------------------------------------------------ grade: filmic curve, charcoal blacks, vignette, dark lower third, grain
img = 1.0 - np.exp(-img * 1.35)
img = np.clip(img, 0, 1) ** 1.08
img += np.array([0.012, 0.012, 0.017], np.float32)[None, None, :] * (1 - img)
rad = np.sqrt(((xx - CX) / (W * 0.62)) ** 2 + ((yy - H * 0.42) / (H * 0.62)) ** 2)
vig = 1 - 0.62 * np.clip(rad, 0, 1.4) ** 2.1
img *= vig[:, :, None]
low = smooth(0.5, 0.95, yy / H)
img *= (1 - 0.78 * low)[:, :, None]
grain = rng.normal(0, 0.016, (H, W)).astype(np.float32)
img += grain[:, :, None]
img = np.clip(img, 0, 1)
Image.fromarray((img * 255).astype(np.uint8)).save(OUT, quality=84, optimize=True, progressive=True, subsampling=2)
print('saved', OUT)
