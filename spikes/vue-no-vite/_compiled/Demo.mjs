

const _sfc_main = {
  props: { name: { type: String, default: "world" } },
  data() {
    return { count: 41 };
  },
  mounted() {
    this.count++; // client-only; must NOT run during SSR
  },
};

import { mergeProps as _mergeProps } from "npm:vue@^3.5.13"
import { ssrRenderAttrs as _ssrRenderAttrs, ssrInterpolate as _ssrInterpolate } from "npm:vue@^3.5.13/server-renderer"

function ssrRender(_ctx, _push, _parent, _attrs) {
  _push(`<div${
    _ssrRenderAttrs(_mergeProps({ class: "box" }, _attrs))
  } data-v-demo123>Hello ${
    _ssrInterpolate(_ctx.name)
  } — count ${
    _ssrInterpolate(_ctx.count)
  }</div>`)
}
_sfc_main.ssrRender = ssrRender;
_sfc_main.__scopeId = "data-v-demo123";
export default _sfc_main;
