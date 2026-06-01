
import { defineComponent as _defineComponent } from "npm:vue@^3.5.13"
import { mergeProps as _mergeProps } from "npm:vue@^3.5.13"
import { ssrRenderAttrs as _ssrRenderAttrs, ssrInterpolate as _ssrInterpolate } from "npm:vue@^3.5.13/server-renderer"

import { computed, ref } from "npm:vue@^3.5.13";


const _sfc_main = /*@__PURE__*/_defineComponent({
  __name: 'Card',
  __ssrInlineRender: true,
  props: {
    name: { type: String, required: true },
    start: { type: Number, required: false }
  },
  setup(__props: any) {

const props = __props;
const greeting = computed(() => `Hello ${props.name}`);
const count = ref(props.start ?? 0);
const doubled = computed(() => count.value * 2);

return (_ctx: any,_push: any,_parent: any,_attrs: any) => {
  _push(`<div${
    _ssrRenderAttrs(_mergeProps({
      class: "card",
      "data-greeting": greeting.value
    }, _attrs))
  } data-v-card789><h1 data-v-card789>${
    _ssrInterpolate(greeting.value)
  }</h1><p data-v-card789>doubled: ${
    _ssrInterpolate(doubled.value)
  }</p></div>`)
}
}

})
_sfc_main.__scopeId = "data-v-card789";
export default _sfc_main;
