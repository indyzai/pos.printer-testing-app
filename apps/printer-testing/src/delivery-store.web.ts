export async function deliveryState(id: string): Promise<string | null> {
    return localStorage.getItem(`indyzai.printer-lab.delivery.${id}`);
}
export async function recordDelivery(id: string, state: string) {
    localStorage.setItem(`indyzai.printer-lab.delivery.${id}`, state);
}
