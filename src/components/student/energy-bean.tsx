interface EnergyBeanProps { size?: number }

/** 装饰图形的可读名称由外层余额或日期提供。 */
export function EnergyBean({ size = 20 }: EnergyBeanProps) {
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="energy-bean shrink-0">
        <path d="M19.5 4.5c4 4-1 14-7.5 16-5 1.5-10-3-8-8C6 6 15.5.5 19.5 4.5Z" fill="var(--bean-fill)" stroke="var(--bean-ink)" strokeWidth="1.5" />
        <path d="M16.5 7c-5 1-3 7-8 10" fill="none" stroke="var(--bean-ink)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>;
}
