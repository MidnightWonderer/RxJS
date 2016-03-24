import {isArray} from './util/isArray';
import {isObject} from './util/isObject';
import {isFunction} from './util/isFunction';
import {tryCatch} from './util/tryCatch';
import {errorObject} from './util/errorObject';

export interface AnonymousSubscription {
  unsubscribe(): void;
}

export type TeardownLogic = AnonymousSubscription | Function | void;

export interface ISubscription extends AnonymousSubscription {
  unsubscribe(): void;
  isUnsubscribed: boolean;
  add(teardown: TeardownLogic): void;
  remove(sub: ISubscription): void;
}

export class Subscription implements ISubscription {
  public static EMPTY: Subscription = (function(empty: any){
    empty.isUnsubscribed = true;
    return empty;
  }(new Subscription()));

  public isUnsubscribed: boolean = false;

  constructor(_unsubscribe?: () => void) {
    if (_unsubscribe) {
      (<any> this)._unsubscribe = _unsubscribe;
    }
  }

  unsubscribe(): void {
    let hasErrors = false;
    let errors: any[];

    if (this.isUnsubscribed) {
      return;
    }

    this.isUnsubscribed = true;

    const { _unsubscribe, _subscriptions } = (<any> this);

    (<any> this)._subscriptions = null;

    if (isFunction(_unsubscribe)) {
      let trial = tryCatch(_unsubscribe).call(this);
      if (trial === errorObject) {
        hasErrors = true;
        (errors = errors || []).push(errorObject.e);
      }
    }

    if (isArray(_subscriptions)) {

      let index = -1;
      const len = _subscriptions.length;

      while (++index < len) {
        const sub = _subscriptions[index];
        if (isObject(sub)) {
          let trial = tryCatch(sub.unsubscribe).call(sub);
          if (trial === errorObject) {
            hasErrors = true;
            errors = errors || [];
            let err = errorObject.e;
            if (err instanceof UnsubscriptionError) {
              errors = errors.concat(err.errors);
            } else {
              errors.push(err);
            }
          }
        }
      }
    }

    if (hasErrors) {
      throw new UnsubscriptionError(errors);
    }
  }

  /**
   * Adds a tear down to be called during the unsubscribe() of this subscription.
   *
   * If the tear down being added is a subscription that is already unsubscribed,
   * is the same reference `add` is being called on, or is `Subscription.EMPTY`,
   * it will not be added.
   *
   * If this subscription is already in an `isUnsubscribed` state, the passed tear down logic
   * will be executed immediately
   *
   * @param {TeardownLogic} teardown the additional logic to execute on teardown.
   */
  add(teardown: TeardownLogic): void {
    if (!teardown || (
        teardown === this) || (
        teardown === Subscription.EMPTY)) {
      return;
    }

    let sub = (<Subscription> teardown);

    switch (typeof teardown) {
      case 'function':
        sub = new Subscription(<(() => void) > teardown);
      case 'object':
        if (sub.isUnsubscribed || typeof sub.unsubscribe !== 'function') {
          break;
        } else if (this.isUnsubscribed) {
          sub.unsubscribe();
        } else {
          ((<any> this)._subscriptions || ((<any> this)._subscriptions = [])).push(sub);
        }
        break;
      default:
        throw new Error('Unrecognized teardown ' + teardown + ' added to Subscription.');
    }
  }

  /**
   * removes a subscription from the internal list of subscriptions that will unsubscribe
   * during unsubscribe process of this subscription.
   * @param {Subscription} subscription the subscription to remove
   */
  remove(subscription: Subscription): void {

    // HACK: This might be redundant because of the logic in `add()`
    if (subscription == null   || (
        subscription === this) || (
        subscription === Subscription.EMPTY)) {
      return;
    }

    const subscriptions = (<any> this)._subscriptions;

    if (subscriptions) {
      const subscriptionIndex = subscriptions.indexOf(subscription);
      if (subscriptionIndex !== -1) {
        subscriptions.splice(subscriptionIndex, 1);
      }
    }
  }
}

export class UnsubscriptionError extends Error {
  constructor(public errors: any[]) {
    super('unsubscriptoin error(s)');
    this.name = 'UnsubscriptionError';
  }
}