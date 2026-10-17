// Nạp khung "UrbanB tại quầy" trên PMS kèm các phần cắm thêm. bridge.js gọi tệp này.
import { mount } from "./ui.js";

export function boot(bridge) {
  if (document.getElementById("urbanb-quay")) return null;
  return mount({ bridge, plugins: [] });
}
