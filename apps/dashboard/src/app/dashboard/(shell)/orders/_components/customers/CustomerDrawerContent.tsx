"use client"

import { CustomerDrawerView } from "./CustomerDrawerSections"
import { useCustomerDrawerState, type CustomerDrawerContentProps } from "./useCustomerDrawerState"

export function CustomerDrawerContent(props: CustomerDrawerContentProps) {
  return <CustomerDrawerView onClose={props.onClose} state={useCustomerDrawerState(props)} />
}
