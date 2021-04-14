import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

interface IOrderProduct {
  product_id: string;
  price: number;
  quantity: number;
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('This customer does not exist.');
    }

    // Extrai os IDs dos produtos do pedido
    const productsIDs = products.map(product => ({ id: product.id }));

    // Descobre os produtos que existem no banco
    const existentProducts = await this.productsRepository.findAllById(
      productsIDs,
    );

    // Se algum produto não existir retorna um erro
    if (products.length !== existentProducts.length) {
      throw new AppError('One of these products does not exist.');
    }

    // Calcula qual será as novas quantidades após gravar o pedido
    const newQuantities: IProduct[] = products.map(product => {
      const existingQuantity =
        existentProducts.find(
          existentProduct => existentProduct.id === product.id,
        )?.quantity || 0;

      return {
        id: product.id,
        quantity: existingQuantity - product.quantity,
      };
    });

    // Se algum produto não ter quantidade necessária
    if (newQuantities.some(newQuantitie => newQuantitie.quantity < 0)) {
      throw new AppError('One or more products has no quantity available.');
    }

    const insertProducts: IOrderProduct[] = products.map(product => ({
      product_id: product.id,
      price:
        existentProducts.find(
          existentProduct => existentProduct.id === product.id,
        )?.price || 0,
      quantity: product.quantity,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: insertProducts,
    });

    await this.productsRepository.updateQuantity(newQuantities);

    return order;
  }
}

export default CreateOrderService;
