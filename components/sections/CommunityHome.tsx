import { getDictionary } from '@/get-dictionary';
import { Locale } from '@/i18n-config';
import { IdeHome, IdeFinal } from '@/components/home/IdeHome';
import { ArticlesPreview } from '@/components/sections/ArticlesPreview';
import { PricingTeaser } from '@/components/sections/PricingTeaser';
import { JsonLd } from '@/components/seo/JsonLd';
import { softwareApplicationJsonLd } from '@/lib/structured-data';

export async function CommunityHome({ lang }: { lang: Locale }) {
  const dict = await getDictionary(lang);

  return (
    <>
      {/* 产品本体：AI 搜索理解「这是什么软件、跑在哪、多少钱」的主要依据。
          字段全部对得上页面可见文本（平台、AGPLv3、社区版免费）。 */}
      <JsonLd
        data={softwareApplicationJsonLd(lang, {
          name: dict.common.productName,
          description: dict.common.seo.homeDescription,
        })}
      />
      <IdeHome lang={lang} dict={dict} />
      {/* 文章与定价沿用原组件，只在首页按「纸与墨」换底色与标题字体（ide-home.css .ide-legacy） */}
      <div className="ide-legacy">
        <ArticlesPreview lang={lang} dict={dict} />
        <PricingTeaser lang={lang} dict={dict} />
      </div>
      <IdeFinal lang={lang} dict={dict} />
    </>
  );
}
