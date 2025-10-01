import intactLogo from "@/assets/logos/intact.png";
import avivaLogo from "@/assets/logos/aviva.png";
import cooperatorsLogo from "@/assets/logos/cooperators.png";
import tdLogo from "@/assets/logos/td.png";
import desjardinsLogo from "@/assets/logos/desjardins.png";
import wawawesaLogo from "@/assets/logos/wawanesa.png";

const InsuranceLogoMarquee = () => {
  const logos = [
    { src: intactLogo, alt: "Intact Insurance" },
    { src: avivaLogo, alt: "Aviva Canada" },
    { src: cooperatorsLogo, alt: "Co-operators" },
    { src: tdLogo, alt: "TD Insurance" },
    { src: desjardinsLogo, alt: "Desjardins Insurance" },
    { src: wawawesaLogo, alt: "Wawanesa Insurance" },
  ];

  return (
    <section className="py-12 bg-white overflow-hidden">
      <div className="container mx-auto px-4 mb-8">
        <h3 className="text-center text-xl font-semibold text-muted-foreground">
          Direct Benefit to Insurance Policies From all Alberta Providers
        </h3>
      </div>
      
      <div className="relative">
        <div className="flex animate-marquee">
          {/* First set of logos */}
          {logos.map((logo, index) => (
            <div
              key={`first-${index}`}
              className="flex-shrink-0 mx-8 flex items-center justify-center h-20 w-32"
            >
              <img
                src={logo.src}
                alt={logo.alt}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ))}
          {/* Duplicate set for seamless loop */}
          {logos.map((logo, index) => (
            <div
              key={`second-${index}`}
              className="flex-shrink-0 mx-8 flex items-center justify-center h-20 w-32"
            >
              <img
                src={logo.src}
                alt={logo.alt}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default InsuranceLogoMarquee;
