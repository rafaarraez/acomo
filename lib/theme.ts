/**
 * El tema lo manda el atributo `data-theme` en <html>, no el sistema: en varios
 * WebViews de Android `prefers-color-scheme` llega mal y la app abría en claro.
 * Por defecto oscuro; el usuario lo cambia con el toggle y se recuerda.
 */

export const THEME_KEY = "dac:theme";

export const THEME_COLORS = {
  dark: "#0a0b12",
  light: "#f6f7fb",
} as const;

export type Theme = keyof typeof THEME_COLORS;

export const DEFAULT_THEME: Theme = "dark";

/**
 * Se inyecta en <head> y corre antes del primer paint: fija el tema guardado
 * (y el color de la barra del navegador) sin que se vea el cambio.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t!=="light"&&t!=="dark")t=${JSON.stringify(
  DEFAULT_THEME,
)};document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?${JSON.stringify(
  THEME_COLORS.light,
)}:${JSON.stringify(THEME_COLORS.dark)});}catch(e){}})();`;
