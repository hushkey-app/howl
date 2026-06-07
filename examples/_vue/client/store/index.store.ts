import { defineStore } from "@hushkey/howl-vue/pinia";

export const useStore = defineStore("main", {
  state: () => ({
    count: 0,
  }),
  actions: {
    inc() {
      this.count++;
    },
  },
});
