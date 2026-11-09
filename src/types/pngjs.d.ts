/** 项目仅使用 pngjs 的同步 RGBA 编解码，限定实际调用的类型表面。 */
declare module "pngjs" {
    export class PNG {
        constructor(options: { width: number; height: number });
        width: number;
        height: number;
        data: Buffer;
        static sync: {
            read(bytes: Buffer, options?: { checkCRC?: boolean }): { width: number; height: number; data: Buffer };
            write(image: { width: number; height: number; data: Buffer }): Buffer;
        };
    }
}
