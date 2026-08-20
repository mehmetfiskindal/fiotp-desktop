import type { FiotpApi } from "../../preload/index";

declare global {
  interface Window {
    fiotp: FiotpApi;
  }
}
