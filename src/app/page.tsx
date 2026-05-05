import { ShieldCheck, ClipboardList, BarChart3, Store } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm flex mb-12">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 dark:lg:bg-zinc-800/30">
          Maycha QA/QC Platform&nbsp;
          <code className="font-bold">v1.0.0-clone</code>
        </p>
      </div>

      <div className="relative flex place-items-center mb-12">
        <h1 className="text-4xl font-bold text-primary flex items-center gap-4">
          <ShieldCheck className="w-12 h-12" />
          Nền tảng Quản lý Chất lượng Maycha
        </h1>
      </div>

      <div className="grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left gap-6">
        <a
          href="#"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
        >
          <h2 className={`mb-3 text-2xl font-semibold flex items-center gap-2`}>
            <ClipboardList className="w-6 h-6 text-primary" />
            Audit{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Thực hiện đánh giá cửa hàng trực tiếp tại hiện trường.
          </p>
        </a>

        <a
          href="#"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
        >
          <h2 className={`mb-3 text-2xl font-semibold flex items-center gap-2`}>
            <BarChart3 className="w-6 h-6 text-primary" />
            Báo cáo{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Theo dõi chỉ số chất lượng (SLA, Ranking) theo thời gian thực.
          </p>
        </a>

        <a
          href="#"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
        >
          <h2 className={`mb-3 text-2xl font-semibold flex items-center gap-2`}>
            <Store className="w-6 h-6 text-primary" />
            Cửa hàng{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Quản lý danh sách 100+ cửa hàng và phân vùng trách nhiệm.
          </p>
        </a>

        <a
          href="#"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
        >
          <h2 className={`mb-3 text-2xl font-semibold`}>
            Action Plan{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50 text-balance`}>
            Xử lý các lỗi vi phạm và theo dõi tiến độ khắc phục.
          </p>
        </a>
      </div>
      
      <div className="mt-20">
        <button className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-full font-bold transition-all transform hover:scale-105">
          Đăng nhập hệ thống
        </button>
      </div>
    </main>
  );
}
