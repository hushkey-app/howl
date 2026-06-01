import { defineComponent as _defineComponent } from "npm:vue@^3.5.13"
import { ssrRenderAttrs as _ssrRenderAttrs, ssrInterpolate as _ssrInterpolate } from "npm:vue@^3.5.13/server-renderer"

import { ref } from "npm:vue@^3.5.13";


const __sfc__ = /*@__PURE__*/_defineComponent({
  __name: 'App',
  __ssrInlineRender: true,
  props: {
    title: { type: String, required: true },
    description: { type: String, required: true },
    start: { type: Number, required: false }
  },
  setup(__props: any) {

const props = __props;
const count = ref(props.start ?? 0);

return (_ctx: any,_push: any,_parent: any,_attrs: any) => {
  _push(`<main${
    _ssrRenderAttrs(_attrs)
  }><h1>${
    _ssrInterpolate(__props.title)
  }</h1><p>${
    _ssrInterpolate(__props.description)
  }</p><button class="cta">clicked ${
    _ssrInterpolate(count.value)
  } times</button></main>`)
}
}

})
export default __sfc__;
