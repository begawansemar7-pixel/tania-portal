import Image from 'next/image';
import { AskTania } from './ask-tania';
import { ValueRail } from './value-rail';

export function Hero({ userName }: { userName: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-linear-to-br from-[#dce9fb] via-[#eef4fd] to-[#f9fcff] shadow-card">
      <div className="grid gap-0 lg:grid-cols-[300px_minmax(0,1fr)_300px] xl:grid-cols-[380px_minmax(0,1fr)_330px]">
        <div className="relative hidden min-h-[480px] lg:block xl:min-h-[520px]">
          <Image
            src="/brand/tania-hero.jpg"
            alt="TANIA, AI Employee untuk Digital Product & Solution"
            fill
            priority
            sizes="380px"
            className="object-cover object-[50%_top]"
          />
          <div className="absolute inset-y-0 left-0 w-10 bg-linear-to-l from-transparent to-[#dce9fb]" aria-hidden />
          <div className="absolute inset-y-0 right-0 w-16 bg-linear-to-r from-transparent to-[#eaf1fc]" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-linear-to-b from-transparent to-[#eef4fd]" aria-hidden />
        </div>

        <div className="px-6 py-8 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink-soft uppercase">
            Your AI Employee for DPS
          </p>
          <h1 className="mt-3 text-3xl font-extrabold text-ink sm:text-4xl">
            Hi {userName},
          </h1>
          <p className="text-2xl font-semibold text-ink sm:text-3xl">
            what can I help you with?
          </p>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft">
            Saya TANIA, AI Employee Anda. Saya membantu menemukan informasi,
            menganalisis data, membuat konten, mengotomasi tugas, dan mengubah
            ide menjadi dampak — untuk DPS yang lebih cerdas, cepat, dan kuat.
          </p>

          <AskTania />
        </div>

        <div className="px-6 pt-2 pb-8 lg:px-4 lg:py-8">
          <ValueRail />
        </div>
      </div>
    </section>
  );
}
